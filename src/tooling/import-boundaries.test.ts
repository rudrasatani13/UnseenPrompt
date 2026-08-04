import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function lintFrom(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, {
    filePath: path.join(process.cwd(), filePath),
  });

  return result?.messages ?? [];
}

/*
 * Booting ESLint and resolving the flat config takes seconds, and it competes
 * with the rest of the suite for CPU. The default 5s timeout is not enough under
 * parallel load, so this suite declares the real cost of the operation.
 */
const eslintBootstrapTimeout = 30_000;

const sourceExtensions = /\.(?:ts|tsx|js|jsx)$/u;
const textExtensions = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|snap|env|txt|ya?ml)$/u;
const textBasenames = new Set([".env.example", ".dev.vars.example"]);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".open-next",
  ".worktrees",
  ".wrangler",
  ".superpowers",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
]);

function sourceFilesUnder(relativeRoot: string): readonly string[] {
  const root = path.join(process.cwd(), relativeRoot);
  if (!existsSync(root)) return [];

  const files: string[] = [];
  function walk(directory: string): void {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (sourceExtensions.test(entry)) {
        files.push(fullPath);
      }
    }
  }
  walk(root);
  return files;
}

function sourceText(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

const modelInfrastructureRoot = path.resolve(process.cwd(), "src/lib/model");
const modelServerConfigModule = path.resolve(process.cwd(), "src/config/model/server");
const projectServerInfrastructureRoot = path.resolve(process.cwd(), "src/lib/project");
const moduleExtensions = /(?:\.d)?\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;

function moduleSpecifiersFromSource(filePath: string, source: string): readonly string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const specifiers: string[] = [];

  function addSpecifier(value: ts.Node | undefined): void {
    if (value !== undefined && ts.isStringLiteralLike(value)) {
      specifiers.push(value.text);
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addSpecifier(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addSpecifier(node.argument.literal);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1
    ) {
      addSpecifier(node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function withoutModuleExtension(filePath: string): string {
  return filePath.replace(moduleExtensions, "");
}

function isWithinPath(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function resolvedModuleTarget(importerPath: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) {
    return path.resolve(process.cwd(), "src", specifier.slice(2));
  }
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(importerPath), specifier);
  }
  return null;
}

function isForbiddenServerModelSpecifier(importerPath: string, specifier: string): boolean {
  const target = resolvedModuleTarget(importerPath, specifier);
  if (target === null) return false;

  const normalizedTarget = withoutModuleExtension(path.normalize(target));
  return (
    isWithinPath(normalizedTarget, modelInfrastructureRoot) ||
    normalizedTarget === modelServerConfigModule
  );
}

function forbiddenServerModelSpecifiers(filePath: string, source: string): readonly string[] {
  const absoluteFilePath = path.resolve(filePath);
  return moduleSpecifiersFromSource(absoluteFilePath, source).filter((specifier) =>
    isForbiddenServerModelSpecifier(absoluteFilePath, specifier),
  );
}

function forbiddenProjectServerSpecifiers(filePath: string, source: string): readonly string[] {
  const absoluteFilePath = path.resolve(filePath);
  return moduleSpecifiersFromSource(absoluteFilePath, source).filter((specifier) => {
    const target = resolvedModuleTarget(absoluteFilePath, specifier);
    if (target === null) return false;
    return isWithinPath(
      withoutModuleExtension(path.normalize(target)),
      projectServerInfrastructureRoot,
    );
  });
}

function textFilesUnder(relativeRoot: string): readonly string[] {
  const root = path.join(process.cwd(), relativeRoot);
  if (!existsSync(root)) return [];

  const files: string[] = [];
  function walk(directory: string): void {
    for (const entry of readdirSync(directory)) {
      if (ignoredDirectories.has(entry)) continue;
      const fullPath = path.join(directory, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (textExtensions.test(entry) || textBasenames.has(entry)) {
        files.push(fullPath);
      }
    }
  }
  walk(root);
  return files;
}

function productionModelFiles(): readonly string[] {
  return [
    ...sourceFilesUnder("src/config/model").filter((filePath) => !filePath.endsWith(".test.ts")),
    ...sourceFilesUnder("src/lib/model").filter((filePath) => !filePath.endsWith(".test.ts")),
  ];
}

describe("architectural import boundaries", () => {
  it(
    "rejects relative imports from lib into app",
    async () => {
      const messages = await lintFrom("src/lib/boundary-fixture.ts", 'import "../app/page";');

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            messageId: "crossLayerImport",
          }),
        ]),
      );
    },
    eslintBootstrapTimeout,
  );

  it(
    "continues to reject alias imports from domain into features",
    async () => {
      const messages = await lintFrom(
        "src/domain/boundary-fixture.ts",
        'import "@/features/project";',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            messageId: "crossLayerImport",
          }),
        ]),
      );
    },
    eslintBootstrapTimeout,
  );

  it("keeps waitlist server config out of client modules", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const clientRoots = ["src/components", "src/features", "src/app"];
    const offenders: string[] = [];

    function walk(directory: string): void {
      for (const entry of readdirSync(directory)) {
        const fullPath = join(directory, entry);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!/\.(tsx|ts|jsx|js)$/u.test(entry)) {
          continue;
        }
        if (fullPath.includes("/api/")) {
          continue;
        }
        const source = readFileSync(fullPath, "utf8");
        if (
          source.includes("@/config/waitlist/server") ||
          source.includes("config/waitlist/server")
        ) {
          // Server Components under app may import server modules; only flag "use client".
          if (source.includes('"use client"') || source.includes("'use client'")) {
            offenders.push(fullPath);
          }
        }
      }
    }

    for (const root of clientRoots) {
      walk(join(process.cwd(), root));
    }

    expect(offenders).toEqual([]);
  });

  it("marks model config, gateway infrastructure, adapters, and store as server-only", () => {
    const requiredServerOnly = [
      path.join(process.cwd(), "src/config/model/server.ts"),
      ...sourceFilesUnder("src/lib/model").filter((filePath) => !filePath.endsWith(".test.ts")),
    ];

    const offenders = requiredServerOnly.filter(
      (filePath) => !/^import ["']server-only["'];/u.test(sourceText(filePath)),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps provider infrastructure out of the domain layer", () => {
    const forbiddenDomainImport =
      /(?:@\/lib\/model|@\/config\/model\/server|server-only|api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|opencode\.ai|\b(?:anthropic|openai|gemini|opencode)\b)/iu;
    const offenders = sourceFilesUnder("src/domain")
      .filter((filePath) => !filePath.endsWith(".test.ts"))
      .filter((filePath) => forbiddenDomainImport.test(sourceText(filePath)));

    expect(offenders).toEqual([]);
  });

  it("keeps Phase 6 project state server-only and out of public/client modules", () => {
    const projectServerFiles = sourceFilesUnder("src/lib/project").filter(
      (filePath) => !filePath.endsWith(".test.ts"),
    );
    const missingServerOnly = projectServerFiles.filter(
      (filePath) => !/^import ["']server-only["'];/u.test(sourceText(filePath)),
    );
    expect(missingServerOnly).toEqual([]);

    const clientOffenders = ["src/app", "src/components", "src/features"]
      .flatMap((root) => sourceFilesUnder(root))
      .filter((filePath) => !filePath.includes(`${path.sep}api${path.sep}`))
      .flatMap((filePath) =>
        forbiddenProjectServerSpecifiers(filePath, sourceText(filePath)).map(
          (specifier) => `${filePath}: ${specifier}`,
        ),
      );
    expect(clientOffenders).toEqual([]);

    const domainOffenders = sourceFilesUnder("src/domain/project")
      .filter((filePath) => !filePath.endsWith(".test.ts"))
      .filter((filePath) => {
        const source = sourceText(filePath);
        return (
          source.includes("server-only") ||
          forbiddenServerModelSpecifiers(filePath, source).length > 0 ||
          forbiddenProjectServerSpecifiers(filePath, source).length > 0
        );
      });
    expect(domainOffenders).toEqual([]);
  });

  it("keeps Phase 6 project-state modules free of content logs and provider secrets", () => {
    const phase6Files = [
      ...sourceFilesUnder("src/lib/project").filter((filePath) => !filePath.endsWith(".test.ts")),
      ...sourceFilesUnder("src/domain/project").filter(
        (filePath) => !filePath.endsWith(".test.ts"),
      ),
    ];
    const logPattern = /\bconsole\.(?:log|warn|error|info|debug|trace)\s*\(/u;
    const contentLogPattern =
      /\b(?:prompt|systemInstruction|context|proposal|provider output|raw error)\b/iu;
    const providerSecretPattern =
      /(?:sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}|sk-(?:proj|live|admin)-[A-Za-z0-9_-]{20,}|AIzaSy[A-Za-z0-9_-]{30,})/u;
    const offenders = phase6Files.filter((filePath) => {
      const source = sourceText(filePath);
      return logPattern.test(source) || providerSecretPattern.test(source);
    });
    expect(offenders).toEqual([]);

    const contentLogMentions = phase6Files.filter((filePath) => {
      const source = sourceText(filePath);
      return logPattern.test(source) && contentLogPattern.test(source);
    });
    expect(contentLogMentions).toEqual([]);
  });

  it("detects alias and relative server model imports in every supported module form", () => {
    const fixturePath = path.join(process.cwd(), "src/app/client-boundary-fixture.ts");
    const offenders = forbiddenServerModelSpecifiers(
      fixturePath,
      [
        'import "@/lib/model/gateway";',
        'export * from "../lib/model/provider";',
        'import "../lib/model/http";',
        'const load = () => import("../lib/model/cost");',
        'import type { ModelEnvironment } from "@/config/model/server";',
        'export { getServerModelEnvironment } from "../config/model/server";',
      ].join("\n"),
    );

    expect(offenders).toEqual([
      "@/lib/model/gateway",
      "../lib/model/provider",
      "../lib/model/http",
      "../lib/model/cost",
      "@/config/model/server",
      "../config/model/server",
    ]);
  });

  it("prevents public/client modules from importing server model code", () => {
    const offenders = ["src/app", "src/components", "src/features"]
      .flatMap((root) => sourceFilesUnder(root))
      .filter((filePath) => !filePath.includes(`${path.sep}api${path.sep}`))
      .flatMap((filePath) =>
        forbiddenServerModelSpecifiers(filePath, sourceText(filePath)).map(
          (specifier) => `${filePath}: ${specifier}`,
        ),
      );

    expect(offenders).toEqual([]);
  });

  it("keeps provider secrets out of public/client source, fixtures, and snapshots", () => {
    const publicNamePattern = /\bNEXT_PUBLIC_(?:ANTHROPIC|OPENAI|GEMINI)[A-Z0-9_]*/u;
    const keyValuePattern =
      /\b(?:ANTHROPIC|OPENAI|GEMINI)_API_KEY\s*=\s*(?!replace-with-local-secret\b)[^\s#]+/u;
    const keyShapePattern =
      /(?:sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}|sk-(?:proj|live|admin)-[A-Za-z0-9_-]{20,}|AIzaSy[A-Za-z0-9_-]{30,})/u;
    const offenders = textFilesUnder(".").filter((filePath) => {
      const source = sourceText(filePath);
      return (
        publicNamePattern.test(source) ||
        keyValuePattern.test(source) ||
        keyShapePattern.test(source)
      );
    });

    expect(offenders).toEqual([]);
  });

  it("has no console/log calls in Phase 5 production server modules", () => {
    const logPattern = /\bconsole\.(?:log|warn|error|info|debug|trace)\s*\(/u;
    const offenders = productionModelFiles().filter((filePath) =>
      logPattern.test(sourceText(filePath)),
    );

    expect(offenders).toEqual([]);
  });

  it("uses fixed provider origins that are not key- or content-derived", () => {
    const endpointSources = [
      ["src/lib/model/providers/anthropic.ts", "https://api.anthropic.com/v1/messages"],
      ["src/lib/model/providers/openai.ts", "https://api.openai.com/v1/responses"],
      ["src/lib/model/providers/gemini.ts", "https://generativelanguage.googleapis.com"],
    ] as const;
    const derivedUrlPattern = /https?:[^\n]*\$\{[^}]*\b(?:apiKey|input|systemInstruction)\b/u;

    for (const [relativePath, endpoint] of endpointSources) {
      const source = sourceText(path.join(process.cwd(), relativePath));
      expect(source).toContain(endpoint);
      expect(source).not.toMatch(derivedUrlPattern);
    }
  });
});
