import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getRealLocalPrs } from "@/src/lib/getRealLocalPrs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    console.error("Error fetching repository PRs:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
