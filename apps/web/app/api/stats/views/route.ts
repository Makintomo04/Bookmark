import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { guardEntitlement } from "@/lib/entitlementsServer";
import { listStatViews } from "@/lib/statViews";
import { DEFAULT_TIME_ZONE, isValidTimeZone, localDay } from "@bookmark/shared/timeZone";
import { SAVED_VIEWS_MAX, SAVED_VIEW_NAME_MAX, explorerSearch, parseExplorerQuery } from "@bookmark/shared/statsExplorer";

// Saved stat views (BOO-82, Plus): the explorer's dates, comparison and filters under a name.
//   GET  /api/stats/views                          { views }
//   POST /api/stats/views { name, query }          query is the explorer's query string
// DELETE /api/stats/views/<id> removes one.

const bodySchema = z.object({
  name: z.string().trim().min(1, "Give the view a name.").max(SAVED_VIEW_NAME_MAX, `Keep the name to ${SAVED_VIEW_NAME_MAX} characters.`),
  query: z.string().max(4000),
});

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const refused = await guardEntitlement(user.id, "statsExplorer");
  if (refused) return refused;
  return NextResponse.json({ views: await listStatViews(user.id) });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const refused = await guardEntitlement(user.id, "statsExplorer");
  if (refused) return refused;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "That view couldn't be saved." }, { status: 400 });
  // Stored in its tidy form, so a view only ever holds what the explorer understands.
  const today = localDay(new Date(), isValidTimeZone(user.timeZone) ? user.timeZone : DEFAULT_TIME_ZONE);
  const parsed = parseExplorerQuery(new URLSearchParams(body.data.query.replace(/^\?/, "")), today);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const count = await prisma.statView.count({ where: { userId: user.id } });
  if (count >= SAVED_VIEWS_MAX) return NextResponse.json({ error: `You can keep up to ${SAVED_VIEWS_MAX} views. Delete one to save another.` }, { status: 400 });

  await prisma.statView.create({ data: { userId: user.id, name: body.data.name, query: explorerSearch(parsed.query) } });
  return NextResponse.json({ views: await listStatViews(user.id) }, { status: 201 });
}
