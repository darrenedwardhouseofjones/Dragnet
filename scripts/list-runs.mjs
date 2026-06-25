import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const cs = process.env.DATABASE_URL;
const wantsStrictSsl = Boolean(cs.match(/sslmode\s*=\s*(verify-full|verify-ca)/i));
const stripped = cs.replace(/&?sslmode=[^&]*/gi, "").replace(/\?&/, "?").replace(/\?$/, "").replace(/&&/g, "&");
const pool = new Pool({
  connectionString: stripped,
  ssl: wantsStrictSsl ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const logs = await prisma.reviewLog.findMany({
  where: { reviewRunId: { not: null } },
  take: 10,
  orderBy: { createdAt: "desc" },
  select: { id: true, prId: true, reviewRunId: true, message: true, level: true, createdAt: true },
});
console.log("--- 10 most recent logs with reviewRunId populated ---");
console.log(JSON.stringify(logs, null, 2));
await pool.end();
