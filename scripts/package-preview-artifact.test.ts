import { execFile } from "node:child_process";
import { access, link, mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const packager = join(process.cwd(), "scripts/package-preview-artifact.py");
const extractor = join(process.cwd(), "scripts/extract-preview-artifact.py");

describe("preview artifact packaging", () => {
  test("materializes valid links and omits dangling links", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-package-links-"));
    const source = join(root, ".open-next");
    const destination = join(root, "trusted");
    const archive = join(root, "preview-worker.tar");
    await mkdir(join(source, "packages"), { recursive: true });
    await mkdir(destination);
    await writeFile(join(source, "worker.js"), "export default {};\n");
    await writeFile(join(source, "packages/runtime.js"), "runtime\n");
    await symlink("packages/runtime.js", join(source, "runtime-link.js"));
    await link(join(source, "packages/runtime.js"), join(source, "runtime-hardlink.js"));
    await symlink("packages/missing.js", join(source, "dangling.js"));

    await execFileAsync("python3", [packager, source, archive]);
    await execFileAsync("python3", [extractor, archive, destination]);

    await expect(readFile(join(destination, ".open-next/runtime-link.js"), "utf8")).resolves.toBe(
      "runtime\n",
    );
    await expect(
      readFile(join(destination, ".open-next/runtime-hardlink.js"), "utf8"),
    ).resolves.toBe("runtime\n");
    await expect(access(join(destination, ".open-next/dangling.js"))).rejects.toThrow();
  });

  test("rejects links that resolve outside the Worker bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-package-outside-"));
    const source = join(root, ".open-next");
    const archive = join(root, "preview-worker.tar");
    await mkdir(source);
    await writeFile(join(source, "worker.js"), "export default {};\n");
    await writeFile(join(root, "credential"), "must-not-archive\n");
    await symlink("../credential", join(source, "credential"));

    await expect(execFileAsync("python3", [packager, source, archive])).rejects.toThrow(
      "resolves outside the preview Worker bundle",
    );
  });

  test("rejects a Worker bundle root that is itself a link", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-package-root-link-"));
    const actualSource = join(root, "actual-bundle");
    const linkedSource = join(root, ".open-next");
    const archive = join(root, "preview-worker.tar");
    await mkdir(actualSource);
    await writeFile(join(actualSource, "worker.js"), "export default {};\n");
    await symlink("actual-bundle", linkedSource);

    await expect(execFileAsync("python3", [packager, linkedSource, archive])).rejects.toThrow(
      "must not be a symbolic link",
    );
  });
});
