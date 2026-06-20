import { prisma } from "@/src/lib/prisma";

export async function findPrByIdOrNumber(param: string): Promise<any | null> {
  const normalized = param.toString().trim();
  if (!normalized) return null;

  let pr = await prisma.pullRequest.findUnique({ where: { id: normalized } });
  if (pr) return pr;

  if (/^\d+$/.test(normalized)) {
    pr = await prisma.pullRequest.findUnique({ where: { id: `pr-${normalized}` } });
    if (pr) return pr;

    const list = await prisma.pullRequest.findMany({
      where: { id: { endsWith: `-${normalized}` } },
    });
    if (list.length > 0) return list[0];
  }

  const fallback = await prisma.pullRequest.findFirst({
    where: { id: { contains: normalized } },
  });
  return fallback || null;
}
