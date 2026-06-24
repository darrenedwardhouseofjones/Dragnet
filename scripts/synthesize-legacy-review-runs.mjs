/**
 * One-shot script: synthesize legacy ReviewRun rows for existing ReviewFinding
 * data that predates the review_runs table.
 *
 * Run AFTER `npx prisma db push` has created the review_runs table.
 *
 * For each distinct prId in review_findings:
 *   - Read the parent PR's commitHash
 *   - Create one ReviewRun with:
 *       status: 'completed'
 *       triggerReason: 'legacy'
 *       commitHash: <pr.commitHash>
 *       diffHash: ''        (unknown — predates hashing)
 *       reviewConfigHash: '' (unknown — predates hashing)
 *       startedAt / completedAt: <min(finding.timestamp)>
 *       model: null
 *   - Update each finding for that prId to set reviewRunId
 *
 * Legacy runs naturally fall out of "current" once a fresh scan produces
 * real hashes — they'll never match a fresh scan's (diffHash, reviewConfigHash).
 *
 * Usage:
 *   set -a && source .env.local && set +a && node scripts/synthesize-legacy-review-runs.mjs
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const cs = process.env.DATABASE_URL;
if (!cs) {
  console.error("[legacy-runs] DATABASE_URL not set");
  process.exit(1);
}
const wantsStrictSsl = Boolean(cs.match(/sslmode\s*=\s*(verify-full|verify-ca)/i));
const stripped = cs
  .replace(/&?sslmode=[^&]*/gi, "")
  .replace(/\?&/, "?")
  .replace(/\?$/, "")
  .replace(/&&/g, "&");
const pool = new Pool({
  connectionString: stripped,
  ssl: wantsStrictSsl ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const findings = await prisma.reviewFinding.findMany({
    select: { id: true, prId: true, timestamp: true },
  });

  if (findings.length === 0) {
    console.log("[legacy-runs] no existing findings — nothing to synthesize.");
    return;
  }

  const byPr = new Map();
  for (const f of findings) {
    if (!byPr.has(f.prId)) byPr.set(f.prId, []);
    byPr.get(f.prId).push(f);
  }

  console.log(
    `[legacy-runs] synthesizing ${byPr.size} legacy ReviewRun(s) for ${findings.length} existing finding(s).`,
  );

  for (const [prId, prFindings] of byPr) {
    const pr = await prisma.pullRequest.findUnique({
      where: { id: prId },
      select: { commitHash: true, repoId: true },
    });
    if (!pr) {
      console.warn(`[legacy-runs] PR ${prId} not found — skipping its findings.`);
      continue;
    }

    const earliestTs = prFindings
      .map((f) => f.timestamp)
      .filter(Boolean)
      .sort()[0];
    const tsDate = earliestTs ? new Date(earliestTs) : new Date();

    const run = await prisma.reviewRun.create({
      data: {
        id: `legacy-${prId}-${Date.now()}`,
        prId,
        repoId: pr.repoId,
        commitHash: pr.commitHash || "",
        diffHash: "",
        reviewConfigHash: "",
        status: "completed",
        startedAt: tsDate,
        completedAt: tsDate,
        model: null,
        rating: null,
        triggerReason: "legacy",
        forced: false,
      },
    });

    await prisma.reviewFinding.updateMany({
      where: { prId },
      data: { reviewRunId: run.id },
    });

    console.log(
      `[legacy-runs] PR ${prId}: created run ${run.id}, linked ${prFindings.length} finding(s).`,
    );
  }

  console.log("[legacy-runs] done.");
}

main()
  .catch((e) => {
    console.error("[legacy-runs] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
