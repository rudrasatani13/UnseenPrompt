import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier/flat";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(repositoryRoot, "src");

const forbiddenDependencies = new Map([
  ["domain", new Set(["app", "components", "config", "features", "lib"])],
  ["config", new Set(["app", "components", "features", "lib"])],
  ["lib", new Set(["app", "components", "features"])],
  ["components", new Set(["app", "features"])],
  ["features", new Set(["app"])],
]);

function sourceLayer(filePath) {
  const relativePath = path.relative(sourceRoot, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.split(path.sep)[0] ?? null;
}

function importedLayer(importerPath, importSource) {
  let importedPath;

  if (importSource.startsWith("@/")) {
    importedPath = path.join(sourceRoot, importSource.slice(2));
  } else if (importSource.startsWith(".")) {
    importedPath = path.resolve(path.dirname(importerPath), importSource);
  } else {
    return null;
  }

  return sourceLayer(importedPath);
}

const architecturePlugin = {
  rules: {
    "no-cross-layer-imports": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          crossLayerImport:
            "{{sourceLayer}} modules must not import from the {{targetLayer}} layer.",
        },
      },
      create(context) {
        const importerPath = context.filename;
        const importerLayer = sourceLayer(importerPath);
        const forbiddenLayers = forbiddenDependencies.get(importerLayer);

        function checkImportSource(node) {
          if (!forbiddenLayers || typeof node.value !== "string") {
            return;
          }

          const targetLayer = importedLayer(importerPath, node.value);

          if (targetLayer && forbiddenLayers.has(targetLayer)) {
            context.report({
              node,
              messageId: "crossLayerImport",
              data: {
                sourceLayer: importerLayer,
                targetLayer,
              },
            });
          }
        }

        return {
          ImportDeclaration: (node) => checkImportSource(node.source),
          ExportAllDeclaration: (node) => checkImportSource(node.source),
          ExportNamedDeclaration: (node) => {
            if (node.source) {
              checkImportSource(node.source);
            }
          },
          ImportExpression: (node) => checkImportSource(node.source),
        };
      },
    },
  },
};

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  eslintConfigPrettier,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      architecture: architecturePlugin,
    },
    rules: {
      "architecture/no-cross-layer-imports": "error",
    },
  },
  globalIgnores([".next/**", ".open-next/**", "coverage/**", "next-env.d.ts"]),
]);
