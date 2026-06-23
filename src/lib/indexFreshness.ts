import { execFileSync } from "node:child_process";

/**
 * Index freshness gate.
 *
 * Two failure modes:
 *   - INDEX_REQUIRED: repo.indexedAt is null — the codebase has never been
 *     indexed. Reviews against an un-indexed repo produce diff-only LLM
 *     guesses with no call-graph or semantic context.
 *   - STALE_INDEX: indexedAt is non-null but the working-tree HEAD has
 *     moved on since indexing (lastCommitHash differs from current HEAD).
 *     Reviews run against stale symbols/edges — findings may reference
 *     code that no longer exists.
 *
 * `lastCommitHash` is populated by IndexingService on every successful
 * run. Existing repos indexed before this field was added have empty
 * `lastCommitHash` — the stale check is skipped for those rows (treated
 * as fresh) until the next reindex.
 *
 * Git failures (not a git repo, git binary missing, etc.) are swallowed
 * and treated as "can't verify, trust indexedAt" — never block scans on
 * git errors.
 */

export type Freshness =
  | { ok: true }
  | { ok: false; kind: "INDEX_REQUIRED" | "STALE_INDEX"; message: string };

export interface RepoForFreshness {
  id: string;
  name: string;
  indexedAt?: string | null;
  lastCommitHash?: string;
  path?: string | null;
}

/**
 * Returns the current HEAD commit hash of the repo at `repoPath`, or
 * null if the path isn't a git repo / git is unavailable.
 *
 * Uses execFileSync (no shell) so weird paths can't inject — args are
 * passed directly to the git binary.
 */
export function currentHeadCommit(repoPath: string): string | null {
  try {
    const out = execFileSync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    const hash = out.trim();
    return /^[0-9a-f]{7,40}$/i.test(hash) ? hash : null;
  } catch {
    return null;
  }
}

export function assertIndexFresh(repo: RepoForFreshness): Freshness {
  if (!repo.indexedAt) {
    return {
      ok: false as const,
      kind: "INDEX_REQUIRED",
      message: `Project "${repo.name}" has not been indexed yet. Index it first via the dashboard (Codebase AST graph tab → Index Now) or POST /api/repos/${repo.id}/index, then retry.`,
    };
  }

  if (!repo.path || !repo.lastCommitHash) {
    return { ok: true as const };
  }

  const head = currentHeadCommit(repo.path);
  if (!head) {
    return { ok: true as const };
  }

  if (head !== repo.lastCommitHash) {
    return {
      ok: false as const,
      kind: "STALE_INDEX",
      message: `Index is stale — indexed at ${repo.lastCommitHash.slice(0, 7)}, working tree HEAD is now ${head.slice(0, 7)}. Reindex before reviewing for current context.`,
    };
  }

  return { ok: true as const };
}
