import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    dialect: "postgres",
    host: "localhost",
    port: "5432",
    username: "postgres",
    database: "postgres",
    sqliteFile: "data.db",
    hasPassword: false
  });
}

export async function POST() {
  return NextResponse.json({ success: true });
}
