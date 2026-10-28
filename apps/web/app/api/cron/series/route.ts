import { NextResponse } from "next/server";
import { recheckSeries } from "@/lib/seriesRecheck";

// Run daily by Vercel Cron (vercel.json): asks Hardcover about series due their weekly re-check and tells
// readers about new books (lib/seriesRecheck.ts). Vercel sends CRON_SECRET as a bearer token; without the
// secret set, the route refuses everyone.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const result = await recheckSeries();
  console.log("[cron/series]", JSON.stringify(result));
  return NextResponse.json(result);
}
