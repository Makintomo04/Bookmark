import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/cronAuth";
import { recheckAuthors } from "@/lib/authorNews";

// Run hourly at half past by Vercel Cron (vercel.json), so it never asks Hardcover while the series cron
// does: records newly followed authors, asks Hardcover about those due their weekly check, files new books
// and tells their readers (lib/authorNews.ts). Vercel sends CRON_SECRET as a bearer token; without the
// secret set, the route refuses everyone.
export const dynamic = "force-dynamic";
// The run stops asking Hardcover after 150 seconds and stops telling readers after 260 (recheckAuthors).
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorised(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const result = await recheckAuthors();
  console.log("[cron/authors]", JSON.stringify(result));
  return NextResponse.json(result);
}
