import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function parseWranglerEvents(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    throw new Error("Wrangler output file is empty");
  }
  return lines.map((line) => JSON.parse(line));
}

function requireHttpsUrl(value, label) {
  if (!value) {
    throw new Error(`Wrangler did not report ${label}`);
  }
  const raw = String(value);
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS`);
  }
  // Preserve the reported string after protocol validation (URL.href may add a trailing slash).
  return raw;
}

function isVersionUpload(event) {
  return event?.type === "version-upload";
}

function isDeployEvent(event) {
  return event?.type === "deploy" || event?.type === "version-upload";
}

export function resolvePreviewUrl(events) {
  for (const event of events) {
    if (!isVersionUpload(event) && event?.type !== "deploy") {
      continue;
    }

    if (event.preview_alias_url) {
      return requireHttpsUrl(event.preview_alias_url, "a preview URL");
    }

    if (event.preview_url) {
      return requireHttpsUrl(event.preview_url, "a preview URL");
    }

    if (Array.isArray(event.preview_urls)) {
      const preferred =
        event.preview_urls.find((value) => String(value).includes("pr-")) ?? event.preview_urls[0];
      if (preferred) {
        return requireHttpsUrl(preferred, "a preview URL");
      }
    }
  }

  throw new Error("Wrangler did not report a preview URL");
}

function targetUrl(target) {
  if (typeof target === "string") {
    return target;
  }
  if (target && typeof target === "object" && target.url) {
    return target.url;
  }
  return undefined;
}

export function resolveDeploymentUrl(events) {
  for (const event of events) {
    if (!isDeployEvent(event)) {
      continue;
    }

    if (event.url) {
      return requireHttpsUrl(event.url, "a deployment URL");
    }

    if (Array.isArray(event.targets)) {
      for (const target of event.targets) {
        const candidate = targetUrl(target);
        if (candidate) {
          return requireHttpsUrl(candidate, "a deployment URL");
        }
      }
    }

    if (event.worker?.url) {
      return requireHttpsUrl(event.worker.url, "a deployment URL");
    }

    if (event.preview_url) {
      return requireHttpsUrl(event.preview_url, "a deployment URL");
    }

    if (Array.isArray(event.preview_urls) && event.preview_urls[0]) {
      return requireHttpsUrl(event.preview_urls[0], "a deployment URL");
    }
  }

  throw new Error("Wrangler did not report a deployment URL");
}

export function resolveVersionId(events) {
  for (const event of events) {
    if (!isVersionUpload(event)) {
      continue;
    }
    const versionId = event.version_id ?? event.id;
    if (versionId) {
      return String(versionId);
    }
  }

  throw new Error("Wrangler did not report a version ID");
}

function writeGithubOutputs({ key, value, summaryLabel }) {
  const githubOutput = process.env.GITHUB_OUTPUT;
  const githubStepSummary = process.env.GITHUB_STEP_SUMMARY;

  if (!githubOutput) {
    throw new Error("GITHUB_OUTPUT is required");
  }
  if (!githubStepSummary) {
    throw new Error("GITHUB_STEP_SUMMARY is required");
  }

  appendFileSync(githubOutput, `${key}=${value}\n`);
  appendFileSync(githubStepSummary, `${summaryLabel}: ${value}\n`);
}

export function main(argv = process.argv, env = process.env) {
  const mode = argv[2];
  const outputFile = env.OUTPUT_FILE;

  if (!outputFile) {
    throw new Error("OUTPUT_FILE is required");
  }

  const events = parseWranglerEvents(readFileSync(outputFile, "utf8"));

  if (mode === "preview-url") {
    const url = resolvePreviewUrl(events);
    writeGithubOutputs({ key: "url", value: url, summaryLabel: "Preview" });
    return url;
  }

  if (mode === "deployment-url") {
    const url = resolveDeploymentUrl(events);
    writeGithubOutputs({ key: "url", value: url, summaryLabel: "Staging" });
    return url;
  }

  if (mode === "version-id") {
    const versionId = resolveVersionId(events);
    writeGithubOutputs({ key: "version_id", value: versionId, summaryLabel: "Production version" });
    return versionId;
  }

  throw new Error(
    "Usage: node scripts/wrangler-output.mjs <preview-url|deployment-url|version-id>",
  );
}

const entryPath = process.argv[1];
if (entryPath && pathToFileURL(entryPath).href === import.meta.url) {
  main();
}
