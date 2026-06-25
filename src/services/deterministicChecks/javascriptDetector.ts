import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Detector, DetectionResult } from "./types";

/**
 * Detects JavaScript projects by `package.json` alone. Runs only if the
 * typescript detector did NOT match (orchestrator order: TS first).
 */
export const javascriptDetector: Detector = {
  async detect(rootDir) {
    const packageJsonPath = join(rootDir, "package.json");
    if (!existsSync(packageJsonPath)) return null;

    let scripts: Record<string, string> = {};
    try {
      const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
      scripts = pkg.scripts ?? {};
    } catch {
      // Malformed package.json — fall through with empty scripts.
    }

    return {
      type: "javascript",
      rootDir,
      packageJsonPath,
      hasNodeModules: existsSync(join(rootDir, "node_modules")),
      scripts,
    };
  },
};
