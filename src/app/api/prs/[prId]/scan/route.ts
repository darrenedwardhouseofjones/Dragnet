import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { runPrScan } from "@/reviewService";

export async function POST(req: Request, { params }: { params: Promise<{ prId: string }> }) {
  const { prId } = await params;
  const body = await req.json().catch(() => ({} as any));
  const { backendOption, localPort, localModel } = body;

  try {
    await prisma.pullRequest.updateMany({ where: { id: prId }, data: { status: 'In Progress' } });
    await new Promise(resolve => setTimeout(resolve, 800));

    const result = await runPrScan(prId, backendOption || "cloud", {
      localPort: localPort ? parseInt(localPort.toString(), 10) : undefined,
      localModel: localModel
    });

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
