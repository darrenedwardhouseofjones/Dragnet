# Standards for Index Schema Hardening

Project has no `.agent-os/standards/index.yml` — these are the implicit
standards being applied, drawn from `CLAUDE.md` and existing code.

---

## 500-line rule

Every file stays under 500 lines. Split into a directory of focused
modules when approaching the limit. The HNSW shell script is ~30 lines;
the schema changes are additive; the embedding guard adds ~10 lines to
an existing file.

## Fail-open pattern

Configuration errors must never crash a scan. Mirror the
discriminated-union + sentinel pattern from
`src/lib/reviewFreshness.ts:34-36` and `src/lib/indexFreshness.ts`:

- Hash computation → return `""` sentinel on failure (never matches a
  stored hash → scan proceeds).
- Embedding generation → return `[]` on dimension mismatch or provider
  error (callers already skip the embedding write).

**Why:** the review/index loop is long-running and user-visible. A
config error mid-scan that crashes the loop is worse than persisting
partial state with a warning.

## Session-pooler for DDL

Supabase's transaction pooler (`aws-*-ap-*.pooler.supabase.com:6543`)
rejects DDL with `prepared statement "s0" already exists`. All schema
mutations go through the session-mode pooler at port 5432 with
`?mode=session`. See `scripts/db-push-direct.sh` for the canonical
URL-derivation pattern.

## Lazy singletons

No module-load side effects. The HNSW index script is run once via
`npx prisma db execute`, not on app startup. The embedding guard runs
lazily inside `generateEmbedding` — no top-level work.

## No speculative code

Every index, every guard, every line has a concrete caller in the
codebase. If a future query needs a different index, add it in that PR.
No "this might be useful someday."
