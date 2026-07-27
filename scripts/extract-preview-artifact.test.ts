import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const extractor = join(process.cwd(), "scripts/extract-preview-artifact.py");

async function createArchive(root: string, entries: string[]) {
  const archive = join(root, "preview-worker.tar");
  await execFileAsync("tar", ["-C", join(root, "payload"), "-cf", archive, ...entries], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  return archive;
}

async function runExtractor(archive: string, destination: string) {
  return execFileAsync("python3", [extractor, archive, destination]);
}

describe("preview artifact extraction", () => {
  test("accepts a regular .open-next Worker bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-artifact-valid-"));
    const payload = join(root, "payload");
    const destination = join(root, "trusted");
    await mkdir(join(payload, ".open-next"), { recursive: true });
    await mkdir(destination);
    await writeFile(join(payload, ".open-next/worker.js"), "export default {};\n");
    const archive = await createArchive(root, [".open-next"]);

    await expect(runExtractor(archive, destination)).resolves.toBeDefined();
    await expect(readFile(join(destination, ".open-next/worker.js"), "utf8")).resolves.toBe(
      "export default {};\n",
    );
  });

  test("rejects members that could overwrite trusted checkout files", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-artifact-overwrite-"));
    const payload = join(root, "payload");
    const destination = join(root, "trusted");
    await mkdir(join(payload, ".open-next"), { recursive: true });
    await mkdir(join(payload, "scripts"), { recursive: true });
    await mkdir(join(destination, "scripts"), { recursive: true });
    await writeFile(join(payload, ".open-next/worker.js"), "export default {};\n");
    await writeFile(join(payload, "scripts/assert-cloudflare-deployment.mjs"), "malicious\n");
    await writeFile(join(destination, "scripts/assert-cloudflare-deployment.mjs"), "trusted\n");
    const archive = await createArchive(root, [".open-next", "scripts"]);

    await expect(runExtractor(archive, destination)).rejects.toThrow(
      "outside the .open-next directory",
    );
    await expect(
      readFile(join(destination, "scripts/assert-cloudflare-deployment.mjs"), "utf8"),
    ).resolves.toBe("trusted\n");
  });

  test("rejects symbolic links inside the Worker bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-artifact-symlink-"));
    const payload = join(root, "payload");
    const destination = join(root, "trusted");
    await mkdir(join(payload, ".open-next"), { recursive: true });
    await mkdir(destination);
    await writeFile(join(payload, ".open-next/worker.js"), "export default {};\n");
    await symlink("worker.js", join(payload, ".open-next/linked-worker.js"));
    const archive = await createArchive(root, [".open-next"]);

    await expect(runExtractor(archive, destination)).rejects.toThrow(
      "only regular files and directories",
    );
  });

  test("rejects duplicate archive member names", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-artifact-duplicate-"));
    const payload = join(root, "payload");
    const destination = join(root, "trusted");
    await mkdir(join(payload, ".open-next"), { recursive: true });
    await mkdir(destination);
    await writeFile(join(payload, ".open-next/worker.js"), "export default {};\n");
    const archive = await createArchive(root, [".open-next"]);
    await execFileAsync("tar", ["-C", payload, "-rf", archive, ".open-next/worker.js"], {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });

    await expect(runExtractor(archive, destination)).rejects.toThrow("duplicate member");
  });
});
