# Index Schema Hardening — Shaping Notes

## Scope

Three tightly-scoped reliability/perf wins for the indexing + review
loop, identified while shipping the Review Freshness Guard:

1. **DB indexes** on Symbol/Edge/ReviewFinding/ReviewRun — every hot
   query path currently full-scans.
2. **Embedding dimension guard** — standardize on `vector(1536)` and
   fail-open (skip + warn) if a provider returns the wrong shape.
3. **HNSW pgvector index** — turns `semanticSearch` from O(n) scan
   into O(log n) approximate nearest-neighbor.

## Decisions

- **No speculative indexes.** Every `@@index` has a corresponding
  `where:` clause in the codebase. If a future query needs a different
  index, add it then.
- **`vector(1536)` stays the canonical dim.** Picking one number and
  guarding it is simpler than supporting per-model dimensions. Swap
  models = update the constant + schema in the same PR.
- **Skip + warn, don't resample.** Auto-padding or truncating an
  embedding produces plausible-looking but semantically wrong vectors.
  Honest absence is better than wrong-and-invisible.
- **HNSW over IVFFlat.** IVFFlat requires re-training when the dataset
  grows 10x — a footgun for incremental indexing. HNSW has no
  training step.
- **Defer relations/cascades.** Adding Repository → Symbol/Edge/File
  FKs would reveal orphaned rows that need a cleanup migration. Real
  correctness work, but deserves its own spec + test plan.

## Context

- **Visuals:** None
- **References:**
  - `src/services/indexing/indexOrchestrator.ts:408-422` — semanticSearch hot path
  - `reviewService.ts:271,278,402,412` — Symbol/Edge query patterns the indexes target
  - `scripts/db-push-direct.sh` — session-pooler URL derivation pattern (mirror for HNSW)
  - `.agent-os/specs/2026-06-24-1746-review-freshness-guard/` — prior spec, format template
- **Product alignment:** Directly supports the PRD §12 (indexing) and §14 (review) loops. No new product surface — just makes existing surfaces feel responsive.

## Standards Applied

- **500-line rule** — every new file stays well under. The HNSW script is ~30 lines.
- **Fail-open pattern** — the embedding guard mirrors `reviewFreshness.ts`: never throw on config errors, return a sentinel (`[]`) that callers already handle.
- **Lazy singletons / no module-load side effects** — the HNSW script runs once via `npx prisma db execute`, not on app startup.
- **Session-pooler workaround for DDL** — same as `db-push-direct.sh`. Transaction pooler (port 6543) rejects DDL with prepared-statement errors.
