/**
 * Find PRs by source branch across all repos. Read-only.
 *
 * Usage:
 *   set -a && source .env.local && set +a && \
 *     node scripts/find-prs.mjs <sourceBranch>
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const branch = process.argv[2] || "";
const cs = process.env.DATABASE_URL;
if (!cs) {
  console.error("[find] DATABASE_URL missing");
  process.exit(1);
}
const wantsStrictSsl = Boolean(cs.match(/sslmode\s*=\s*(verify-full|verify-ca)/i));
const stripped = cs.replace(/&?sslmode=[^&]*/gi, "").replace(/\?&/, "?").replace(/\?$/, "").replace(/&&/g, "&");
const pool = new Pool({
  connectionString: stripped,
  ssl: wantsStrictSsl ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const prs = await prisma.pullRequest.findMany({
  where: branch ? { sourceBranch: branch } : {},
  select: { id: true, sourceBranch: true, repoId: true, commitHash: true, title: true },
  take: 20,
  orderBy: { createdAt: "desc" },
});

console.log(`[find] ${prs.length} PR(s)${branch ? ` matching branch=${branch}` : ""}:\n`);
for (const p of prs) {
  console.log(`  ${p.id}`);
  console.log(`    branch:  ${p.sourceBranch}`);
  console.log(`    repo:    ${p.repoId}`);
  console.log(`    commit:  ${(p.commitHash || "").slice(0, 12)}`);
  console.log(`    title:   ${(p.title || "").slice(0, 80)}`);
  console.log("");
}

await prisma.$disconnect();
