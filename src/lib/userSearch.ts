import { prisma } from "@/src/lib/prisma";
import { safeReadFileSync, resolveSafePath } from "@/src/lib/pathSafety";
import fs from "node:fs/promises";
import path from "node:path";

export async function searchUsersByName(query: string) {
  return prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true },
    take: 50,
  });
}

export async function readUserAvatar(repoRoot: string, avatarPath: string): Promise<string | null> {
  // pathSafety.resolveSafePath rejects `..` segments, absolute paths, and
  // symlink escape before we touch disk. Then fs.promises.readFile keeps
  // the read off the event loop for large files.
  const relative = path.join("avatars", avatarPath);
  const safePath = resolveSafePath(repoRoot, relative);
  if (safePath === null) return null;
  try {
    return await fs.readFile(safePath, "utf-8");
  } catch {
    return null;
  }
}

// `safeReadFileSync` is re-exported here only to keep the import non-empty for
// consumers that still want a synchronous read; the async path above is the
// preferred API. This export can be removed once all callers migrate.
export const _syncAvatarReaderForTests = safeReadFileSync;
