import { typescriptDetector } from "./typescriptDetector";
import { javascriptDetector } from "./javascriptDetector";
import { tscRunner } from "./tscRunner";
import { eslintRunner } from "./eslintRunner";
import type { DeterministicFinding, DetectionResult, Runner } from "./types";

// Order matters: more-specific first. typescriptDetector requires BOTH
// package.json + tsconfig.json; javascriptDetector only package.json.
// If TS matches, we never fall through to JS.
const DETECTORS = [typescriptDetector, javascriptDetector];

// Map ProjectType → runners. Adding a language = add a new key here.
const RUNNERS_BY_TYPE: Record<DetectionResult["type"], Runner[]> = {
  typescript: [tscRunner, eslintRunner],
  javascript: [eslintRunner],
};

/**
 * Detects the project type at `rootDir` and runs the matching
 * deterministic tools (tsc, eslint). Returns a flat list of findings
 * with `source` set to the tool that produced each one.
 *
 * Contract:
 *   - Never throws. Failures become `severity: info` findings.
 *   - Returns [] when no detector matched (not a JS/TS repo) — silent skip.
 *   - Each runner runs in parallel; a crash in one doesn't abort others.
 */
export async function runDeterministicChecks(
  rootDir: string,
): Promise<DeterministicFinding[]> {
  for (const detector of DETECTORS) {
    const detection = await detector.detect(rootDir);
    if (!detection) continue;

    const runners = RUNNERS_BY_TYPE[detection.type] ?? [];
    const results = await Promise.all(
      runners.map(async (runner) => {
        try {
          return await runner.run(detection);
        } catch (err: any) {
          return [{
            filename: "<tooling>",
            line: null,
            severity: "info" as const,
            category: "Skipped",
            explanation: `${runner.name} runner crashed: ${err.message}`,
            source: runner.name,
          }] satisfies DeterministicFinding[];
        }
      }),
    );
    return results.flat();
  }
  return [];
}
