# Tasks — Index Schema Hardening (Phase 1)

Mark each `- [ ]` as `- [x]` when complete. Per user convention: update
this file as work ships, one commit per phase.

## Phase 1 — Spec documentation

- [ ] Create `.agent-os/specs/2026-06-24-1957-index-schema-hardening/`
      with plan.md, shape.md, standards.md, references.md, tasks.md.

## Phase 2 — Prisma indexes

- [ ] Add `@@index([repoId, filePath])` and `@@index([repoId, name])`
      to `Symbol`.
- [ ] Add `@@index([repoId, toId, kind])`, `@@index([repoId, toId])`,
      `@@index([repoId, fromId])` to `Edge`.
- [ ] Add `@@index([prId, reviewRunId])` to `ReviewFinding`.
- [ ] Add `@@index([repoId, status, completedAt])` to `ReviewRun`.
- [ ] `npm run lint` clean.

## Phase 3 — Embedding dimension guard

- [ ] Add `EMBEDDING_DIM = 1536` constant to `embeddingService.ts`.
- [ ] In `generateEmbedding`, check `vector.length === EMBEDDING_DIM`.
      On mismatch: log warning + return `[]`.
- [ ] Verify callers already handle `[]` (skip embedding write, persist
      summary). If not, fix the caller.
- [ ] `npm run lint` clean.

## Phase 4 — HNSW pgvector index script

- [ ] Create `scripts/create-embedding-hnsw-index.sh` mirroring
      `scripts/db-push-direct.sh`.
- [ ] SQL: `CREATE INDEX IF NOT EXISTS symbols_embedding_hnsw_idx ON
      "symbols" USING hnsw ("embedding" vector_cosine_ops) WHERE
      "embedding" IS NOT NULL;`.
- [ ] `chmod +x scripts/create-embedding-hnsw-index.sh`.

## Phase 5 — Tests + apply schema

- [ ] Write `tests/embeddingGuard.test.ts` — 1536 passes through, 1024
      returns `[]` + warns, provider error returns `[]`.
- [ ] `npm run lint` clean.
- [ ] `npm test` — all tests pass.
- [ ] `npm run build` succeeds.
- [ ] `bash scripts/db-push-direct.sh` — applies the four new indexes.
- [ ] `bash scripts/create-embedding-hnsw-index.sh` — applies HNSW.
- [ ] Manual: trigger a re-index of any repo. Watch logs for either
      the happy path or the new dimension-mismatch warning.
