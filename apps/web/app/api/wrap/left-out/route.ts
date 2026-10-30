import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getWrapped, parseWrappedMonth, parseWrappedYear } from "@/lib/stats";

function wholeYear(raw: string) {
  const year = parseWrappedYear(raw);
  return year ? { year, month: null } : null;
}

// How many private books a share card leaves out, so the app's share sheet can say so ("2 private
// books left out") before the reader posts it. The card itself never mentions them: it's public.
//   GET /api/wrap/left-out?year=2026            the year's Wrapped story
//   GET /api/wrap/left-out?year=2026&month=10   a monthly card (month 1–12)
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const rawYear = searchParams.get("year") ?? "";
  const rawMonth = searchParams.get("month");
  const period = rawMonth === null ? wholeYear(rawYear) : parseWrappedMonth(rawYear, rawMonth);
  if (!period) return NextResponse.json({ error: "Pick a year or month that has already started." }, { status: 400 });

  const [all, shared] = await Promise.all([
    getWrapped(user.id, period.year, period.month),
    getWrapped(user.id, period.year, period.month, { sharedOnly: true }),
  ]);
  return NextResponse.json({ privateBooks: Math.max(0, all.distinctBooks - shared.distinctBooks) });
}
