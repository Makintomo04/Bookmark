// Fills bookmark-test with what Catch me up needs to be walked through by hand: ten well-known books
// paused (or left untouched) at different points, a series whose first two books are finished and whose
// third is next, an obscure book that shouldn't get the button, and a reading circle on Gone Girl with
// one comment before the reader's point and one spoiler well past it. Test data only: refuses to run
// anywhere else. Safe to re-run: works are matched by key, shelves by work, and the reader's recaps and
// AI usage are cleared each run so the free allowance starts fresh.
//
//   node scripts/with-test-db.mjs node scripts/seed-recaps.ts
//
// Accounts (password: see PASSWORD below), both verified, FREE plan:
//   recap-reader@bookmark.test  recapreader   the reader coming back to their books
//   recap-friend@bookmark.test  recapfriend   hosts the Gone Girl circle and has finished it
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const PASSWORD = "catch-me-up-2026";

if (!/bookmark-test/.test(process.env.DATABASE_URL ?? "")) {
  console.error("seed-recaps: only runs against bookmark-test (use scripts/with-test-db.mjs)");
  process.exit(2);
}

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;

interface SeedBook {
  title: string;
  author: string;
  status: "PAUSED" | "STARTED" | "COMPLETED" | "NOT_STARTED";
  // Where the reader is, as a percent of the book.
  percent?: number;
  // Listened to: running time in minutes, progress in minutes.
  audioMinutes?: number;
  // Days since the last progress update (STARTED books).
  idleDays?: number;
  series?: [name: string, position: number];
  note?: string;
}

const BOOKS: SeedBook[] = [
  // The ten resume checks.
  { title: "Project Hail Mary", author: "Andy Weir", status: "PAUSED", percent: 30, note: "Grace keeps getting memories back: he was a junior high science teacher, and the Petrova line is dimming the sun." },
  { title: "The Hobbit", author: "J. R. R. Tolkien", status: "PAUSED", percent: 55 },
  { title: "Pride and Prejudice", author: "Jane Austen", status: "PAUSED", percent: 40 },
  { title: "The Name of the Wind", author: "Patrick Rothfuss", status: "PAUSED", percent: 25 },
  { title: "Dune", author: "Frank Herbert", status: "STARTED", percent: 20, idleDays: 21 },
  { title: "Harry Potter and the Prisoner of Azkaban", author: "J. K. Rowling", status: "PAUSED", percent: 70 },
  { title: "Gone Girl", author: "Gillian Flynn", status: "PAUSED", percent: 40 },
  { title: "The Silent Patient", author: "Alex Michaelides", status: "PAUSED", percent: 75 },
  { title: "The Martian", author: "Andy Weir", status: "PAUSED", percent: 45, audioMinutes: 653 },
  { title: "Rebecca", author: "Daphne du Maurier", status: "PAUSED", percent: 47 },
  // The series check: books one and two finished, three next.
  { title: "The Hunger Games", author: "Suzanne Collins", status: "COMPLETED", series: ["The Hunger Games", 1] },
  { title: "Catching Fire", author: "Suzanne Collins", status: "COMPLETED", series: ["The Hunger Games", 2] },
  { title: "Mockingjay", author: "Suzanne Collins", status: "NOT_STARTED", series: ["The Hunger Games", 3] },
  // Below the popularity line: no button.
  { title: "The Bone Shard Daughter", author: "Andrea Stewart", status: "PAUSED", percent: 30 },
];

async function lookup(book: SeedBook) {
  const fields = "key,title,author_name,cover_i,number_of_pages_median,first_publish_year";
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.author)}&fields=${fields}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Bookmark test seed" } });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const doc = (await res.json())?.docs?.[0];
  if (!doc?.key) return null;
  return {
    workKey: String(doc.key).replace("/works/", ""),
    title: doc.title as string,
    authors: (doc.author_name as string[] | undefined)?.slice(0, 3) ?? [book.author],
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
    pages: typeof doc.number_of_pages_median === "number" ? doc.number_of_pages_median : 350,
    year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : null,
  };
}

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const account = async (email: string, username: string, favColour: string) => (await prisma.user.upsert({
    where: { email },
    create: { email, username, favColour, hashedPassword, emailVerified: new Date(), plan: "FREE", timeZone: "Europe/London" },
    update: { username, hashedPassword, emailVerified: new Date(), plan: "FREE", showRecaps: null },
    select: { id: true },
  })).id;
  const reader = await account("recap-reader@bookmark.test", "recapreader", "#2B8A3E");
  const friend = await account("recap-friend@bookmark.test", "recapfriend", "#1971C2");

  const now = Date.now();
  const shelf = new Map<string, { bookId: string; workKey: string; title: string; author: string; cover: string | null; pages: number }>();
  for (const seed of BOOKS) {
    const found = await lookup(seed).catch((err) => { console.warn(`  ${seed.title}: lookup failed (${err.message})`); return null; });
    if (!found) { console.warn(`  ${seed.title}: not found, skipped`); continue; }
    const key = `ol:${found.workKey}`;
    const workData = {
      openLibraryKey: found.workKey, title: found.title, authors: found.authors, coverUrl: found.coverUrl, firstPublishYear: found.year,
      seriesName: seed.series?.[0] ?? null, seriesPosition: seed.series?.[1] ?? null,
      // Looked up afresh by the app on first use.
      popularityCheckedAt: null,
    };
    const work = await prisma.work.upsert({ where: { key }, create: { key, subjects: [], ...workData }, update: workData });

    const percent = seed.status === "COMPLETED" ? 100 : seed.percent ?? 0;
    const onMinutes = !!seed.audioMinutes;
    const position = Math.round((percent / 100) * (onMinutes ? seed.audioMinutes! : found.pages));
    const started = seed.status === "NOT_STARTED" ? null : new Date(now - 60 * DAY);
    const data = {
      title: found.title, author: found.authors[0], coverImage: found.coverUrl ?? "", pages: found.pages, status: seed.status,
      workKey: found.workKey, workId: work.id,
      currentPage: onMinutes ? 0 : seed.status === "COMPLETED" ? found.pages : position,
      progressUnit: onMinutes ? "MINUTES" as const : null, audioMinutes: seed.audioMinutes ?? null, currentMinute: onMinutes ? position : null,
      startedAt: started,
      completedAt: seed.status === "COMPLETED" ? new Date(now - 30 * DAY) : null,
      stoppedAt: seed.status === "PAUSED" ? new Date(now - 10 * DAY) : null,
      progressAt: seed.status === "STARTED" ? new Date(now - (seed.idleDays ?? 1) * DAY) : seed.status === "PAUSED" ? new Date(now - 10 * DAY) : null,
      timesRead: seed.status === "COMPLETED" ? 1 : 0,
    };
    const existing = await prisma.book.findFirst({ where: { userId: reader, workId: work.id }, select: { id: true } });
    const book = existing
      ? await prisma.book.update({ where: { id: existing.id }, data })
      : await prisma.book.create({ data: { userId: reader, ...data } });
    await prisma.note.deleteMany({ where: { bookId: book.id } });
    if (seed.note) await prisma.note.create({ data: { bookId: book.id, title: "So far", content: seed.note } });
    shelf.set(seed.title, { bookId: book.id, workKey: found.workKey, title: found.title, author: found.authors[0], cover: found.coverUrl, pages: found.pages });
    console.log(`  ${found.title}: ${seed.status}${seed.percent ? ` at ${seed.percent}%` : ""}${onMinutes ? " (audiobook)" : ""}`);
  }

  // The Gone Girl circle: recapfriend has finished it; one comment at 20% (unlocked for the reader at
  // 40%) and one spoiler at 60% that the lock keeps from them, and so from the recap.
  const gone = shelf.get("Gone Girl");
  if (gone) {
    const friendBook = await prisma.book.findFirst({ where: { userId: friend, workKey: gone.workKey }, select: { id: true } })
      ?? await prisma.book.create({ data: { userId: friend, title: gone.title, author: gone.author, coverImage: gone.cover ?? "", pages: gone.pages, status: "COMPLETED", currentPage: gone.pages, workKey: gone.workKey, timesRead: 1, completedAt: new Date() } });
    const code = "RECAPGONE";
    const circle = await prisma.buddyRead.upsert({
      where: { inviteCode: code },
      create: { inviteCode: code, hostId: friend, workKey: gone.workKey, title: gone.title, author: gone.author, coverImage: gone.cover, pages: gone.pages, startsAt: new Date(now - 60 * DAY) },
      update: {},
    });
    for (const [userId, bookId] of [[friend, friendBook.id], [reader, gone.bookId]] as const) {
      await prisma.buddyReadMember.upsert({
        where: { buddyReadId_userId: { buddyReadId: circle.id, userId } },
        create: { buddyReadId: circle.id, userId, bookId },
        update: { bookId },
      });
    }
    await prisma.buddyReadComment.deleteMany({ where: { buddyReadId: circle.id } });
    await prisma.buddyReadComment.create({ data: { buddyReadId: circle.id, userId: friend, position: 20, body: "Nick's lawn-mowing neighbour and the treasure-hunt clues are so creepy. And why does he keep smiling for the cameras?" } });
    await prisma.buddyReadComment.create({ data: { buddyReadId: circle.id, userId: friend, position: 60, body: "SPOILER CHECK: Amy is alive and framed Nick on purpose. The diary was fake all along." } });
  }

  await prisma.recap.deleteMany({ where: { userId: reader } });
  await prisma.aiUsage.deleteMany({ where: { userId: reader } });
  console.log(`\n${shelf.size} books; recapreader ${reader}, recapfriend ${friend}`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
