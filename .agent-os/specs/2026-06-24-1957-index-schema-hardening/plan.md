# Plan — Index Schema Hardening (Phase 1)

## Context

Two latent issues surfaced while shipping the Review Freshness Guard
(`.agent-os/specs/2026-06-24-1746-review-freshness-guard/`):

1. **`symbols.embedding` drifted to `text` in production.** The column
   was declared `Unsupported("vector(1536)")` in `prisma/schema.prisma`
   but the live table had it as `text`. Pushing the schema required
   dropping 693 embeddings to recast. That silent drift means there's
   no guard preventing a future embedding-model swap from breaking
   semantic search the same way.

2. **Hot read paths have no DB indexes.** The review loop and the
   `/api/repos/[id]/callgraph` + `/symbols` + `/edges` routes all
   filter `Symbol` / `Edge` by `repoId` and either `filePath` or
   `name`, and `Edge` lookups by `(toId, kind)` for reverse call-graph
   walks. Every one of these is a full table scan today. On a 10k-symbol
   repo it's already noticeable; on 100k it'll be unusable.

3. **`semanticSearch` has no HNSW index.** `indexOrchestrator.ts:413`
   runs `ORDER BY embedding <=> query::vector` — a brute-force scan.
   HNSW is the standard fix for cosine similarity on pgvector.

**Scope locked with user (2026-06-24):**
- Add DB indexes for the actual hot query patterns.
- Standardize on `vector(1536)` and add a runtime dimension guard.
- Add the HNSW pgvector index via raw SQL script.
- **Defer** relations/cascades (Repository → Symbol/Edge/File) to a
  follow-on spec — that one requires orphan cleanup and its own test
  plan.

## Task 1: Save spec documentation

Create `.agent-os/specs/2026-06-24-1957-index-schema-hardening/` with
five files matching the convention (see
`.agent-os/specs/2026-06-24-1746-review-freshness-guard/`):

- **plan.md** — this plan, verbatim
- **shape.md** — scope, decisions, context
- **standards.md** — implicit standards (500-line rule, fail-open
  pattern for the embedding guard — mirror `reviewFreshness.ts`)
- **references.md** — pointers to `indexOrchestrator.ts:413`
  (semanticSearch hot path), `reviewService.ts:271,402,412` (query
  patterns the indexes target), `scripts/db-push-direct.sh` (pattern
  for the HNSW script)
- **tasks.md** — phase-grouped `- [ ]` checkboxes

## Task 2: Add Prisma indexes

**File:** `prisma/schema.prisma`

Add `@@index` declarations to four models. Every index has a
corresponding query in the codebase — no speculative indexing.

**`Symbol`** (currently 172 lines, ends with `@@map("symbols")`):

```prisma
model Symbol {
  // ... existing fields unchanged ...
  @@index([repoId, filePath])               // reviewService.ts:271
  @@index([repoId, name])                   // reviewService.ts:402
  @@map("symbols")
}
```

**`Edge`** (currently 185 lines, ends with `@@map("edges")`):

```prisma
model Edge {
  // ... existing fields unchanged ...
  @@index([repoId, toId, kind])             // getCallers tool — reviewService.ts:412
  @@index([repoId, toId])                   // caller lookup — reviewService.ts:278
  @@index([repoId, fromId])                 // forward call-graph (callees)
  @@map("edges")
}
```

**`ReviewFinding`** (already has `@@index([reviewRunId])`):

```prisma
  @@index([reviewRunId])                    // existing
  @@index([prId, reviewRunId])              // NEW — run-scoped deleteMany/findMany
```

**`ReviewRun`** (already has `@@index([prId, status, completedAt])`):

```prisma
  @@index([prId, status, completedAt])      // existing
  @@index([repoId, status, completedAt])    // NEW — repo-level latest-run reads
```

**Verify:** `npm run lint` clean. Push via `bash scripts/db-push-direct.sh`.

## Task 3: Embedding dimension guard

**File:** `src/services/embeddingService.ts` (or wherever
`generateEmbedding` lives — verify before editing)

**Change:** add a constant `EMBEDDING_DIM = 1536`. After the provider
returns a vector, check `vector.length === EMBEDDING_DIM`. If not:

- Log a single warning per call (not per symbol — already covered by
  the existing `embeddingCircuitOpen` pattern for repeated failures,
  but this is a different failure mode so warrants its own log line):
  ```
  [embedding] model X returned 1024 dimensions, schema requires 1536 —
  summary saved, semantic search disabled for this symbol
  ```
- Return `[]` (empty array). Callers (`indexOrchestrator.ts`) already
  handle empty by skipping the embedding write and persisting the
  summary alone.

**Fail-open:** the guard must not throw. A dimension mismatch is a
config issue, not a runtime error — surface it, don't crash the scan.

**Why not auto-pad/truncate:** silent resampling would give plausible-
looking but semantically wrong results. Honest "skip + warn" is better
than wrong-and-invisible.

## Task 4: HNSW pgvector index script

**New file:** `scripts/create-embedding-hnsw-index.sh`

Mirror the pattern from `scripts/db-push-direct.sh` — derive the
session-pooler URL from `DATABASE_URL` in `.env.local`, run raw SQL
via `prisma db execute --stdin`.

```bash
#!/usr/bin/env bash
# Create the HNSW index on symbols.embedding for fast cosine similarity.
# Prisma can't model HNSW indexes — raw SQL is the supported path.
set -euo pipefail
# ... same env-loading + URL-derivation as db-push-direct.sh ...
SQL='CREATE INDEX IF NOT EXISTS symbols_embedding_hnsw_idx
ON "symbols" USING hnsw ("embedding" vector_cosine_ops)
WHERE "embedding" IS NOT NULL;'
echo "$SQL" | DATABASE_URL="$SESSION_URL" npx prisma db execute --stdin
```

**Why HNSW over IVFFlat:** HNSW has better recall at low `ef_search`
and doesn't require a separate training step. For a code-review tool
where the symbol count grows incrementally, IVFFlat's "re-train when
the dataset 10x's" requirement is a footgun.

**Run after Task 2** (the index creation is independent of the
Prisma-modeled indexes, but running both in the same session-pooler
push minimizes round-trips).

## Task 5: Tests + verification

**New test:** `tests/embeddingGuard.test.ts` — mock the embedding
provider, assert that:
- 1536-dim output → returned as-is.
- 1024-dim output → returns `[]` + logs warning.
- Provider error → returns `[]` (existing behavior, unchanged).

**Final verification:**
1. `npm run lint` clean.
2. `npm test` — all existing 72 tests + new guard test pass.
3. `npm run build` succeeds.
4. `bash scripts/db-push-direct.sh` — applies the four new indexes.
5. `bash scripts/create-embedding-hnsw-index.sh` — applies HNSW.
6. Manual: trigger a re-index of any repo. Watch logs for either
   "embedded N symbols" (happy path) or the new dimension-mismatch
   warning (if the configured model is incompatible).

## Critical files referenced

- `prisma/schema.prisma:156-185` — Symbol + Edge models (add indexes)
- `prisma/schema.prisma:133-154` — ReviewFinding (add prId+reviewRunId)
- `prisma/schema.prisma:76-95` — ReviewRun (add repoId+status+completedAt)
- `src/services/embeddingService.ts` — guard location (verify first)
- `src/services/indexing/indexOrchestrator.ts:408-422` — semanticSearch
- `reviewService.ts:271,402,412` — query patterns indexes target
- `scripts/db-push-direct.sh` — pattern to mirror for HNSW script
