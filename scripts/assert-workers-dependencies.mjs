import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const runtimeDependencies = Object.keys(manifest.dependencies ?? {});
const forbidden = new Set(["better-sqlite3", "canvas", "electron", "fs-ext", "node-gyp"]);
const violations = runtimeDependencies.filter((name) => forbidden.has(name));

if (violations.length > 0) {
  throw new Error(`Workers-incompatible direct dependencies: ${violations.sort().join(", ")}`);
}
