import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/cronAuth";
import { recheckSeries } from "@/lib/seriesRecheck";

// Run hourly by Vercel Cron (vercel.json): records new series, asks Hardcover about series due their weekly
// re-check, and tells readers about new books (lib/seriesRecheck.ts). Vercel sends CRON_SECRET as a bearer
// token; without the secret set, the route refuses everyone.
export const dynamic = "force-dynamic";
// The run stops asking Hardcover after 150 seconds and stops telling readers after 260 (recheckSeries).
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorised(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const result = await recheckSeries();
  console.log("[cron/series]", JSON.stringify(result));
  return NextResponse.json(result);
}
