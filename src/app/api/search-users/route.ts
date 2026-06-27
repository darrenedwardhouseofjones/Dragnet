import { NextResponse } from "next/server";
import { requireSession } from "@/src/lib/api-auth";
import { searchUsersByName, readUserAvatar } from "@/src/lib/userSearch";

const MAX_Q_LEN = 100;
const MAX_AVATAR_LEN = 256;

export async function GET(req: Request) {
  try {
    await requireSession(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") || "").slice(0, MAX_Q_LEN);
  const avatar = (url.searchParams.get("avatar") || "").slice(0, MAX_AVATAR_LEN);

  if (!query) {
    return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });
  }

  const users = await searchUsersByName(query);

  let avatarData: string | null = null;
  if (avatar) {
    const repoRoot = process.cwd();
    avatarData = await readUserAvatar(repoRoot, avatar);
  }

  return NextResponse.json({ users, avatar: avatarData });
}
