import { NextResponse } from "next/server";
import { getPublicUrl } from "@/src/lib/publicUrl";

export async function GET() {
  try {
    return NextResponse.json(getPublicUrl());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
