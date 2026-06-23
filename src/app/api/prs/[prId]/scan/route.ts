import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { runPrScan } from "@/reviewService";
import { refreshPrFiles } from "@/src/lib/getRealLocalPrs";

export async function POST(req: Request, { params }: { params: Promise<{ prId: string }> }) {
  const { prId } = await params;
  await req.json().catch(() => ({}));

  try {
    const pr = await prisma.pullRequest.findUnique({
      where: { id: prId },
      select: { repoId: true, sourceBranch: true, targetBranch: true },
    });
    if (!pr) {
      return NextResponse.json({ error: "PR not found." }, { status: 404 });
    }

    const repo = await prisma.repository.findUnique({
      where: { id: pr.repoId },
      select: { indexedAt: true, name: true, path: true, baseBranch: true },
    });
    if (!repo) {
      return NextResponse.json({ error: "Repository record not found." }, { status: 404 });
    }
    if (!repo.indexedAt) {
      return NextResponse.json(
        {
          error: "INDEX_REQUIRED",
          message: `Project "${repo.name}" has not been indexed yet. Index the codebase first (Codebase AST graph tab → Re-index), then run the review.`,
          repoId: pr.repoId,
        },
        { status: 409 },
      );
    }

    await prisma.pullRequest.updateMany({ where: { id: prId }, data: { status: 'In Progress' } });

    // Refresh git diff before scanning — ensures PrFile records are current
    // even if the PR was just created or files were never fetched.
    const repoPath = repo.path;
    const baseBranch = pr.targetBranch || repo.baseBranch || "main";
    if (repoPath && pr.sourceBranch) {
      await refreshPrFiles(repoPath, baseBranch, pr.sourceBranch, prId);
    }

    const result = await runPrScan(prId);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Scan processing failed:", err);
    try {
      await prisma.pullRequest.updateMany({ where: { id: prId }, data: { status: 'Failed' } });
    } catch (dbErr) {
      console.error("Failed to mark PR status as Failed:", dbErr);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
