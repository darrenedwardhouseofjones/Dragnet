import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { IndexingService } from "@/src/services/indexingService";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const repo = await prisma.repository.findUnique({ where: { id } });
    if (!repo) {
      return NextResponse.json({ error: "Repository record not found" }, { status: 404 });
    }

    await prisma.repository.updateMany({ where: { id }, data: { status: 'stabilizing' } });
    const stats = await IndexingService.indexFolder(id, repo.path);
    return NextResponse.json({ success: true, stats });
  } catch (err: any) {
    console.error("Failed indexing repository folder:", err);
    try {
      await prisma.repository.updateMany({ where: { id: (await params).id }, data: { status: 'idle' } });
    } catch {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
