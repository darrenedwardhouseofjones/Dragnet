import fs from "node:fs";
import path from "node:path";

/**
 * Resolves `candidate` against `repoPath` and returns the real on-disk
 * absolute path if it stays inside the repo, or null if it escapes.
 *
 * Defends against:
 *   - **Absolute paths** — `path.join("/repo", "/etc/passwd")` returns
 *     `"/etc/passwd"`, discarding the base. Naive `startsWith(repoPath)`
 *     checks also fall to this when the candidate is absolute.
 *   - **`..` traversal** — `path.join("/repo", "../../etc/passwd")`
 *     escapes the sandbox.
 *   - **Symlink escape** — a symlink inside the repo pointing at
 *     `/etc/passwd` passes the lexical `path.relative` check, but the
 *     `realpathSync` resolves to the target. We re-check after resolving.
 *
 * Why not `startsWith`? `"/home/u/myrepo".startsWith("/home/u/myrepo")`
 * is true for `"/home/u/myrepo-secrets/..."` — a sibling directory that
 * shares the prefix. `path.relative` + `..` check is the safe form.
 *
 * Used by:
 *   - `reviewService.ts` readFile tool (LLM-controlled `filePath`)
 *   - `indexOrchestrator.ts` startBackgroundEnrichment (DB-stored `sym.filePath`)
 *   - `findingVerifier.ts` loadFileContent (LLM-cited `filename`)
 *
 * All three accept untrusted input that could escape the repo sandbox
 * without this check.
 */
export function resolveSafePath(repoPath: string, candidate: string): string | null {
  const base = path.resolve(repoPath);
  const absolute = path.resolve(base, candidate);
  const rel = path.relative(base, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  try {
    const realPath = fs.realpathSync(absolute);
    const realBase = fs.realpathSync(base);
    const realRel = path.relative(realBase, realPath);
    if (realRel.startsWith("..") || path.isAbsolute(realRel)) return null;
    return realPath;
  } catch {
    return null; // ENOENT etc — caller handles "missing"
  }
}
