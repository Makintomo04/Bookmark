import { NextResponse } from "next/server";
import { handleOf } from "@/lib/handle";
import { can } from "@/lib/roles";
import prisma from "@/lib/db";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { requireUser } from "@/lib/apiAuth";
import { findLists, OWN_LISTS_MAX, parseListInput } from "@/lib/lists";
import { withoutUploadedCovers } from "@/lib/uploads";

// Public: browsing lists works signed out.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const viewer = await getCurrentUser();
  const lists = await findLists({
    pick: searchParams.get("pick") === "1",
    community: searchParams.get("community") === "1",
    featured: searchParams.get("featured") === "1",
    reported: searchParams.get("reported") === "1",
    genre: searchParams.get("genre") || undefined,
    owner: handleOf(searchParams.get("owner")) || undefined,
    limit: Number(searchParams.get("limit")) || undefined,
  }, viewer);
  return NextResponse.json(lists);
}

export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser("Sign in to make a list.");
  if (response) return response;
  if (!can(currentUser, "lists.curate") && (await prisma.list.count({ where: { ownerId: currentUser.id } })) >= OWN_LISTS_MAX) {
    return NextResponse.json({ error: `You can have up to ${OWN_LISTS_MAX} lists. Delete one to make room.` }, { status: 400 });
  }

  const parsed = parseListInput(await req.json(), can(currentUser, "lists.curate"));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const list = await prisma.list.create({
    data: { ...parsed.data, ownerId: currentUser.id, items: { createMany: { data: await withoutUploadedCovers(parsed.items) } } },
  });
  return NextResponse.json({ id: list.id });
}
