import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { guardEntitlement } from "@/lib/entitlementsServer";
import { explorerFinishes } from "@/lib/stats";
import { EXPLORER_CHARTS, chartFileName, chartRows, csvOf, explore, parseExplorerQuery, type ExplorerChart } from "@bookmark/shared/statsExplorer";

// The stats explorer (BOO-82, Plus): any range, a second range beside it, and filters, worked out from the
// same finishes as /stats. Every stat on /stats stays free; this route is the new way of looking.
//   GET /api/stats/explore?from=2026-01-01&to=2026-10-31&cfrom=2025-01-01&cto=2025-10-31&format=AUDIOBOOK&mood=dark
//   &csv=genres   the chart as a CSV file instead (timeline, formats, genres, authors, moods, spice, ratings)
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const refused = await guardEntitlement(user.id, "statsExplorer");
  if (refused) return refused;

  const { searchParams } = new URL(req.url);
  const { finishes, today, timeZone } = await explorerFinishes(user.id);
  const parsed = parseExplorerQuery(searchParams, today);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = explore(finishes, parsed.query);

  const csv = searchParams.get("csv");
  if (csv !== null) {
    if (!(EXPLORER_CHARTS as readonly string[]).includes(csv)) return NextResponse.json({ error: "Pick a chart to download." }, { status: 400 });
    return new NextResponse(csvOf(chartRows(result, csv as ExplorerChart)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${chartFileName(csv as ExplorerChart, parsed.query.range)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return NextResponse.json({ ...result, today, timeZone });
}
