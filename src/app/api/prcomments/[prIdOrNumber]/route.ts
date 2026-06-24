import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { findPrByIdOrNumber } from "@/src/lib/findPr";
import { authenticateApiRequest } from "@/src/lib/apiAuth";
import { getLatestCompletedReview } from "@/src/lib/reviewFreshness";

export async function GET(req: Request, { params }: { params: Promise<{ prIdOrNumber: string }> }) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ status: "Error", message: auth.error }, { status: 401 });
  }

  const { prIdOrNumber } = await params;
  try {
    const url = new URL(req.url);
    const repoId = url.searchParams.get("repoId") || undefined;
    const pr = await findPrByIdOrNumber(prIdOrNumber, repoId);
    if (!pr) {
      return NextResponse.json({
        status: "Error",
        message: `Pull request reference "${prIdOrNumber}" could not be matched in the database.`
      }, { status: 404 });
    }

    const latest = await getLatestCompletedReview(pr.id);
    const rating = latest.reviewRun?.rating ?? pr.rating;
    const ratingInfo = rating != null ? `${rating}/10` : "Unrated";
    const isProduction = rating != null ? (rating >= 8 ? "YES" : "NO") : "N/A";

    return NextResponse.json({
      status: "Success",
      prId: pr.id,
      title: pr.title,
      productionScore: ratingInfo,
      productionGrade: isProduction,
      reviewRun: latest.reviewRun,
      stale: latest.stale,
      rejectedCount: latest.rejectedCount,
      comments: latest.findings.map(f => ({
        id: f.id,
        category: f.category,
        severity: f.severity,
        filename: f.filename,
        line: f.line,
        comment: f.explanation,
        fixSuggestion: f.diffSuggestion,
        evidenceChain: f.evidenceChain ? JSON.parse(f.evidenceChain) : []
      }))
    });
  } catch (err: any) {
    console.error("[prcomments error]:", err);
    return NextResponse.json({ status: "Error", message: err.message }, { status: 500 });
  }
}
