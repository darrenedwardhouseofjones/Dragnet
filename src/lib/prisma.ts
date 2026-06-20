import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  __prismaPool?: Pool;
  __prisma?: PrismaClient;
};

if (!globalForPrisma.__prismaPool) {
  globalForPrisma.__prismaPool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/postgres",
  });
}

if (!globalForPrisma.__prisma) {
  const adapter = new PrismaPg(globalForPrisma.__prismaPool);
  globalForPrisma.__prisma = new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.__prisma;
export const pool = globalForPrisma.__prismaPool;
