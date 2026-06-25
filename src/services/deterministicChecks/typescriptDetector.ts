import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Detector, DetectionResult } from "./types";

/**
 * Detects TypeScript projects by the presence of both `package.json`
 * and `tsconfig.json`. If only `package.json` exists, returns null and
 * lets the javascript detector handle it.
 *
 * Detection is purely file-presence based — no config parsing beyond
 * the package.json `scripts` map (needed by runners to honor their
 * typecheck/lint script names).
 */
export const typescriptDetector: Detector = {
  async detect(rootDir) {
    const packageJsonPath = join(rootDir, "package.json");
    const tsconfigPath = join(rootDir, "tsconfig.json");
    if (!existsSync(packageJsonPath) || !existsSync(tsconfigPath)) return null;

    let scripts: Record<string, string> = {};
    try {
      const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
      scripts = pkg.scripts ?? {};
    } catch {
      // Malformed package.json — fall through with empty scripts.
    }

    return {
      type: "typescript",
      rootDir,
      packageJsonPath,
      tsconfigPath,
      hasNodeModules: existsSync(join(rootDir, "node_modules")),
      scripts,
    };
  },
};
