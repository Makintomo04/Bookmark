// Fills the two test readers (seed-test-readers.ts) so the profile in bands can be judged with
// the cases its design turns on: four books on the go (one an audiobook, one with a long title), a book being
// read with a reading circle and logged in chapters, followed authors, a friend reading something, and that
// friend as a creator-sized account (eight favourites, fifteen public lists, their goal on show). Run
// seed-test-readers.ts first. Safe to run again: it finds what it made by title and only fills what's
// missing. Test data only.
//
//   node scripts/with-test-db.mjs node scripts/seed-profile-bands.ts
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

if (!/bookmark-test/.test(process.env.DATABASE_URL ?? "")) {
  console.error("seed-profile-bands: only runs against bookmark-test (use scripts/with-test-db.mjs)");
  process.exit(2);
}

const prisma = new PrismaClient();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// The circle's book: the host and the guest both read it, at different places.
const CIRCLE_BOOK = { title: "The Well of Ascension", author: "Brandon Sanderson", pages: 590, chapters: 59 };

interface Reading {
  title: string
  author: string
  pages: number
  currentPage?: number
  audioMinutes?: number
  currentMinute?: number
  startedDaysAgo: number
}

// The host's books on the go, besides the circle's book.
const HOST_READING: Reading[] = [
  { title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Gabrielle Zevin", pages: 401, currentPage: 132, startedDaysAgo: 9 },
  { title: "Piranesi", author: "Susanna Clarke", pages: 272, audioMinutes: 541, currentMinute: 203, startedDaysAgo: 4 },
];
const GUEST_READING: Reading[] = [
  { title: "Fourth Wing", author: "Rebecca Yarros", pages: 517, currentPage: 318, startedDaysAgo: 6 },
];
const HOST_AUTHORS = ["Ursula K. Le Guin", "Kazuo Ishiguro", "Brandon Sanderson", "Susanna Clarke", "Becky Chambers"];
const GUEST_AUTHORS = ["Rebecca Yarros", "Sarah J. Maas"];

// The guest as a creator: eight favourites from their finished shelf, and fifteen public lists.
const GUEST_FAVOURITES: [string, string][] = [
  ["A Court of Thorns and Roses", "Sarah J. Maas"], ["Iron Flame", "Rebecca Yarros"], ["The Cruel Prince", "Holly Black"],
  ["From Blood and Ash", "Jennifer L. Armentrout"], ["Powerless", "Lauren Roberts"], ["Divine Rivals", "Rebecca Ross"],
  ["Quicksilver", "Callie Hart"], ["The Serpent and the Wings of Night", "Carissa Broadbent"],
];
const GUEST_LISTS = [
  "Spice 3, no cheating", "Morally grey men", "Enemies to lovers", "Found family fantasy", "Slow burn that pays off",
  "Books that broke me", "Comfort rereads", "Audiobooks with great narrators", "KU gems", "Dragons, obviously",
  "Fae courts", "Standalones only", "Short and spicy", "Series worth finishing", "Gift these",
];

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function userId(username: string) {
  const user = await prisma.user.findFirst({ where: { username }, select: { id: true } });
  if (!user) throw new Error(`No ${username}: run scripts/seed-test-readers.ts first`);
  return user.id;
}

// Puts a book on Currently reading at the given place, adding it to the shelf if it isn't there.
async function reading(uid: string, r: Reading) {
  const existing = await prisma.book.findFirst({ where: { userId: uid, title: r.title }, select: { id: true } });
  const data = {
    status: "STARTED" as const,
    pages: r.pages,
    currentPage: r.currentPage ?? 0,
    progressUnit: r.audioMinutes ? "MINUTES" as const : "PAGES" as const,
    audioMinutes: r.audioMinutes ?? null,
    currentMinute: r.currentMinute ?? null,
    startedAt: daysAgo(r.startedDaysAgo),
    progressAt: daysAgo(1),
  };
  const book = existing
    ? await prisma.book.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.book.create({ data: { userId: uid, title: r.title, author: r.author, coverImage: "", ...data }, select: { id: true } });
  return book.id;
}

async function follow(uid: string, names: string[]) {
  for (const name of names) {
    const key = `TEST-${slug(name)}`;
    await prisma.authorFollow.upsert({
      where: { userId_authorKey: { userId: uid, authorKey: key } },
      create: { userId: uid, authorKey: key, name, slug: slug(name) },
      update: {},
    });
  }
}

async function main() {
  const host = await userId("circlehost");
  const guest = await userId("circleguest");

  const hostCircleBook = await reading(host, { ...CIRCLE_BOOK, currentPage: 240, startedDaysAgo: 12 });
  // The host logs the circle's book in chapters: chapter 25 of 59 has begun (40.7% through).
  await prisma.book.update({ where: { id: hostCircleBook }, data: { logsIn: "CHAPTERS", chapters: CIRCLE_BOOK.chapters, currentChapter: 25, currentPercent: 40.7 } });
  const guestCircleBook = await reading(guest, { ...CIRCLE_BOOK, currentPage: 201, startedDaysAgo: 12 });
  for (const r of HOST_READING) await reading(host, r);
  for (const r of GUEST_READING) await reading(guest, r);

  // One active circle on the shared book, hosted by circlehost with circleguest in it.
  let circle = await prisma.buddyRead.findFirst({ where: { hostId: host, title: CIRCLE_BOOK.title, status: "ACTIVE" }, select: { id: true } });
  if (!circle) {
    circle = await prisma.buddyRead.create({
      data: {
        title: CIRCLE_BOOK.title, author: CIRCLE_BOOK.author, pages: CIRCLE_BOOK.pages, hostId: host,
        startsAt: daysAgo(12), inviteCode: randomBytes(6).toString("hex"),
      },
      select: { id: true },
    });
  }
  for (const [uid, bookId] of [[host, hostCircleBook], [guest, guestCircleBook]] as const) {
    await prisma.buddyReadMember.upsert({
      where: { buddyReadId_userId: { buddyReadId: circle.id, userId: uid } },
      create: { buddyReadId: circle.id, userId: uid, bookId, joinedAt: daysAgo(12) },
      update: { bookId },
    });
  }

  await follow(host, HOST_AUTHORS);
  await follow(guest, GUEST_AUTHORS);
  await prisma.book.update({ where: { id: guestCircleBook }, data: { chapters: CIRCLE_BOOK.chapters } });

  // The guest as a creator: favourites, public lists, and their goal on their profile.
  const favouriteIds: string[] = [];
  for (const [title, author] of GUEST_FAVOURITES) {
    const existing = await prisma.book.findFirst({ where: { userId: guest, title }, select: { id: true } });
    const book = existing ?? await prisma.book.create({
      data: { userId: guest, title, author, coverImage: "", pages: 400, currentPage: 400, status: "COMPLETED", completedAt: daysAgo(30), rating: 4.5 },
      select: { id: true },
    });
    favouriteIds.push(book.id);
  }
  await prisma.user.update({ where: { id: guest }, data: { favouriteIds, showGoal: true } });
  for (const [i, title] of GUEST_LISTS.entries()) {
    if (await prisma.list.findFirst({ where: { ownerId: guest, title }, select: { id: true } })) continue;
    const picks = [0, 1, 2].map((n) => GUEST_FAVOURITES[(i + n) % GUEST_FAVOURITES.length]);
    await prisma.list.create({
      data: {
        ownerId: guest, title, visibility: "PUBLIC",
        items: { create: picks.map(([t, a], position) => ({ title: t, author: a, position })) },
      },
    });
  }
  const year = new Date().getFullYear();
  const goal = await prisma.readingGoal.findFirst({ where: { userId: guest, year }, select: { id: true } });
  if (!goal) await prisma.readingGoal.create({ data: { userId: guest, year, targetBooks: 12 } });

  const hostReading = await prisma.book.count({ where: { userId: host, status: "STARTED" } });
  const guestReading = await prisma.book.count({ where: { userId: guest, status: "STARTED" } });
  console.log(`circlehost: ${hostReading} on the go, circle ${circle.id}, ${HOST_AUTHORS.length} authors followed`);
  console.log(`circleguest: ${guestReading} on the go, ${GUEST_AUTHORS.length} authors followed, ${favouriteIds.length} favourites, ${GUEST_LISTS.length} lists, goal shown`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
