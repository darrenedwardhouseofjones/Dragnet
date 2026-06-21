import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getRealLocalPrs } from "@/src/lib/getRealLocalPrs";

/**
 * In-process set of repos currently being rescanned. Prevents the
 * background recompute from piling up when reads come faster than
 * the git scan can complete (e.g. the 15s poller vs a 60s scan).
 * Lives only in this dev server process — fine for a single-host dev
 * tool, would need to be Redis-backed (or dropped) for multi-instance.
 */
const refreshing = new Set<string>();

/**
 * Read is pure DB. The expensive git rescan runs fire-and-forget in
 * the background; the next poll picks up any changes. This keeps
 * read latency down to a single findMany (sub-100ms on Supabase).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const repo = await prisma.repository.findUnique({ where: { id } });
    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    if (!refreshing.has(id)) {
      refreshing.add(id);
      void getRealLocalPrs(repo.path, id)
        .catch((err) => console.warn(`Background PR refresh failed for ${id}:`, err))
        .finally(() => refreshing.delete(id));
    }

    const prs = await prisma.pullRequest.findMany({
      where: { repoId: id },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(prs);
  } catch (err: any) {
    console.error("Error fetching repository PRs:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Force a rescan and wait for it. Used by the manual "refresh" button
 * when the user wants the freshest possible state.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const repo = await prisma.repository.findUnique({ where: { id } });
    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    await getRealLocalPrs(repo.path, id);

    const prs = await prisma.pullRequest.findMany({
      where: { repoId: id },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(prs);
  } catch (err: any) {
    console.error("Error refreshing repository PRs:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
