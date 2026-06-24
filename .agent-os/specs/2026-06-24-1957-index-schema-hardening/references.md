# References for Index Schema Hardening

## Hot query paths the indexes target

### `Symbol (repoId, filePath)`

- **Location:** `reviewService.ts:271`
- **Query:**
  ```ts
  prisma.symbol.findMany({
    where: { repoId: pr.repoId, filePath: { in: files.map(f => f.filename) } },
  })
  ```
- **Why indexed:** builds the "Codebase AST Symbols Detected & Modified
  in PR" context block on every scan. Without the index, filters by
  repoId (full scan within repo), then PostgreSQL filters the `IN`
  list in memory.

### `Symbol (repoId, name)`

- **Location:** `reviewService.ts:402`
- **Query:**
  ```ts
  prisma.symbol.findMany({
    where: { repoId: pr.repoId, name: { contains: fnArgs.query } },
    take: 10,
  })
  ```
- **Why indexed:** the `searchCodebase` tool the LLM calls during the
  agentic loop. Without the index, each `searchCodebase` call
  full-scans the repo's symbols.

### `Edge (repoId, toId, kind)`

- **Location:** `reviewService.ts:412`
- **Query:**
  ```ts
  prisma.edge.findMany({
    where: { repoId: pr.repoId, toId: fnArgs.symbolId, kind: "CALLS" },
  })
  ```
- **Why indexed:** the `getCallers` tool. Walks the reverse call graph
  to find what invokes a changed function.

### `Edge (repoId, toId)`

- **Location:** `reviewService.ts:278`
- **Query:**
  ```ts
  prisma.edge.findMany({
    where: { repoId: pr.repoId, toId: sym.id },
  })
  ```
- **Why indexed:** caller lookup in the per-symbol context builder.
  Slightly different from the getCallers tool — no `kind` filter.

### `Edge (repoId, fromId)`

- **Why indexed:** forward call-graph walks (callees of a changed
  function). No current caller in the codebase, but the symmetry with
  the `toId` indexes is correct and cheap. If a callee tool is added
  later, the index is already there.

### `ReviewFinding (prId, reviewRunId)`

- **Locations:**
  - `reviewService.ts:538` — `deleteMany({ where: { prId } })` on each scan
  - `src/lib/reviewFreshness.ts:288` — `findMany({ where: { reviewRunId } })`
- **Why indexed:** the deleteMany is the more critical path — without
  a `prId` index it scans the whole table on every scan. The
  reviewRunId half supports the freshness short-circuit.

### `ReviewRun (repoId, status, completedAt)`

- **Why indexed:** no current caller in the codebase, but the
  repo-level overview card (list of repos with their latest review
  rating) is an obvious next feature. Without this index, that query
  scans all ReviewRun rows.

## semanticSearch hot path (HNSW target)

- **Location:** `src/services/indexing/indexOrchestrator.ts:408-422`
- **Query:**
  ```ts
  prisma.$queryRaw`
    SELECT id, ..., 1 - (embedding <=> ${vectorStr}::vector) as score
    FROM "symbols"
    WHERE "repoId" = ${repoId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `
  ```
- **Why HNSW:** `ORDER BY embedding <=> query` is a brute-force cosine
  similarity scan over every embedding in the repo. HNSW gives
  approximate nearest-neighbor in O(log n). The partial index
  (`WHERE embedding IS NOT NULL`) skips the 693+ rows currently
  missing embeddings after the drift cleanup.

## Prior spec for format

- `.agent-os/specs/2026-06-24-1746-review-freshness-guard/` — sibling
  spec. Format, structure, and commit cadence (one commit per phase)
  are the template.

## Session-pooler script pattern

- `scripts/db-push-direct.sh` — derives session-pooler URL from
  `DATABASE_URL` in `.env.local`, swaps port `6543` → `5432` and
  `pgbouncer=true` → `mode=session`. The HNSW script mirrors this.
