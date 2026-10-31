import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { genrePicks } from "@/lib/genrePicks";
import { followingPicks, teamPickBooks } from "@/lib/lists";
import { preferencesOf } from "@/lib/preferences";
import { readerName } from "@/lib/profile";
import { starterSections, starterWhy, type FirstBookPicks, type StarterBook } from "@bookmark/shared/firstBook";

// "Help me pick my first book" (BOO-52), for the web's /first-book and the app's picker: your Want to read,
// what people you follow loved, the team's picks and what's popular in your genres. No AI, so it works with
// AI features off; Ask the shelf is offered after it as a separate, labelled step.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const [shelf, genres, following, team] = await Promise.all([
    prisma.book.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, workKey: true, title: true, author: true, coverImage: true, pages: true },
    }),
    genrePicks(user.id, user.favGenres ?? []),
    followingPicks(user.id),
    teamPickBooks(),
  ]);

  const wantToRead: StarterBook[] = shelf.filter((b) => b.status === "NOT_STARTED").map((b) => ({
    key: `shelf-${b.id}`, bookId: b.id, workKey: b.workKey, title: b.title, author: b.author, coverUrl: b.coverImage || null, pages: b.pages || null,
  }));
  const friends: StarterBook[] = following.picks.map((p) => ({
    key: p.key, ...p.book, coverUrl: p.book.coverUrl ?? null, pages: p.book.pages ?? null,
    why: starterWhy({ name: readerName(p.person), rating: p.rating, listTitle: p.list?.title }),
    quote: p.reason,
  }));
  const teamBooks: StarterBook[] = team.map((t) => ({
    key: t.key, ...t.book, why: starterWhy({ listTitle: t.list.title }), quote: t.note,
  }));
  const popular: StarterBook[] = genres.books.map((b, i) => ({
    key: `genre-${b.workKey ?? i}`, ...b,
  }));

  const body: FirstBookPicks = {
    sections: starterSections({
      wantToRead,
      friends,
      team: teamBooks,
      genres: popular,
      genreLabels: genres.genres.map((g) => g.label),
      shelf,
    }),
    hasGenres: (user.favGenres ?? []).length > 0,
    aiFeatures: preferencesOf(user).aiFeatures,
  };
  return NextResponse.json(body);
}
