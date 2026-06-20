import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getRealLocalPrs } from "@/src/lib/getRealLocalPrs";

export async function GET() {
  try {
    const reposRaw = await prisma.repository.findMany({
      include: { _count: { select: { pullRequests: true } } },
    });
    const repos = reposRaw.map(r => ({ ...r, prCount: r._count.pullRequests }));
    return NextResponse.json(repos);
  } catch (err: any) {
    console.error("Error fetching repositories:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, name, path: repoPath, baseBranch, activeBranch, triggerMode, quietPeriodSeconds, branchPattern } = body;
    const cleanId = id || name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now();

    await prisma.repository.create({
      data: {
        id: cleanId,
        name: name,
        path: repoPath,
        baseBranch: baseBranch || "main",
        activeBranch: activeBranch || baseBranch || "main",
        triggerMode: triggerMode || "auto",
        quietPeriodSeconds: quietPeriodSeconds || 10,
        branchPattern: branchPattern || "*",
        status: 'idle',
        lastCommitHash: 'a1b2c3d',
        lastCommitMessage: 'initial repository watch link',
        lastActivityTime: new Date().toISOString(),
        stabilizationTimer: 0,
        reviewsCount: 0
      }
    });

    await getRealLocalPrs(repoPath, cleanId);

    return NextResponse.json({ success: true, id: cleanId }, { status: 201 });
  } catch (err: any) {
    console.error("Error inserting repository:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
