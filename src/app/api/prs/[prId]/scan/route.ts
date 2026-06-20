import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { runPrScan } from "@/reviewService";

export async function POST(req: Request, { params }: { params: Promise<{ prId: string }> }) {
  const { prId } = await params;
  // Body is intentionally ignored — backend/port/model selection moved to
  // the LLM Settings tab and read from env by runPrScan directly.
  await req.json().catch(() => ({}));

  try {
    await prisma.pullRequest.updateMany({ where: { id: prId }, data: { status: 'In Progress' } });
    await new Promise(resolve => setTimeout(resolve, 800));

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
