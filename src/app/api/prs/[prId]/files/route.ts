import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ prId: string }> }) {
  try {
    const { prId } = await params;
    const files = await prisma.prFile.findMany({ where: { prId } });
    return NextResponse.json(files);
  } catch (err: any) {
    console.error("Error fetching files for PR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
