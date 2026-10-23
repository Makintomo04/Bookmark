// Creates (or resets) the demo account Apple and Google's reviewers sign in with, on whichever database
// DATABASE_URL points at. Reviewers use the live app, so for a store submission that's production.
//
//   REVIEW_EMAIL=... REVIEW_PASSWORD=... node scripts/with-test-db.mjs node scripts/seed-review-account.ts
//   REVIEW_EMAIL=... REVIEW_PASSWORD=... node scripts/seed-review-account.ts --production
//
// The password is never in the repo: it goes in App Store Connect's and Play Console's review notes.
// What it sets up, so every reviewed feature has something to show:
//   - the reviewer (username appreview): books reading, finished (rated and reviewed) and want to read,
//     and a yearly goal;
//   - a friend (username appreviewfriend, who can't sign in), followed both ways;
//   - a reading circle the friend hosts, with one comment the reviewer has reached and one still locked
//     past their progress, so the spoiler lock and the report menu (guideline 1.2) can be tried.
// Running it again puts both accounts back to exactly this.
import { PrismaClient, type Status } from "@prisma/client";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

const email = process.env.REVIEW_EMAIL?.trim().toLowerCase();
const password = process.env.REVIEW_PASSWORD;
if (!email || !password || password.length < 12) {
  console.error("seed-review-account: set REVIEW_EMAIL and REVIEW_PASSWORD (12+ characters)");
  process.exit(2);
}
const url = process.env.DATABASE_URL ?? "";
const isTest = /bookmark-test/.test(url);
if (!isTest && !process.argv.includes("--production")) {
  console.error("seed-review-account: DATABASE_URL isn't bookmark-test. Pass --production to seed it anyway.");
  process.exit(2);
}

const friendEmail = email.replace("@", "+friend@");
const cover = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
// The same alphabet as makeInviteCode in packages/shared/src/buddyReads.ts. Kept here so the script runs
// under plain Node, without the test loader (which pins DATABASE_URL to nowhere on purpose).
const inviteCode = () => Array.from(randomBytes(10), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

type Shelved = { title: string; author: string; isbn: string; pages: number; genre: string; status: Status; page?: number; rating?: number; review?: string; started?: number; finished?: number };

const SHELF: Shelved[] = [
  { title: "Project Hail Mary", author: "Andy Weir", isbn: "9780593135204", pages: 476, genre: "Science Fiction", status: "STARTED", page: 190, started: 9 },
  { title: "The Hobbit", author: "J.R.R. Tolkien", isbn: "9780547928227", pages: 300, genre: "Fantasy", status: "COMPLETED", rating: 4.5, review: "Still the coziest adventure there is. Bilbo's riddles in the dark get me every time.", started: 60, finished: 48 },
  { title: "Circe", author: "Madeline Miller", isbn: "9780316556347", pages: 393, genre: "Fantasy", status: "COMPLETED", rating: 4, started: 40, finished: 25 },
  { title: "Piranesi", author: "Susanna Clarke", isbn: "9781635575637", pages: 272, genre: "Fantasy", status: "NOT_STARTED" },
];

const prisma = new PrismaClient();

async function upsertUser(address: string, username: string, favColour: string, hashedPassword: string) {
  return prisma.user.upsert({
    where: { email: address },
    create: { email: address, username, favColour, hashedPassword, emailVerified: new Date() },
    update: { username, favColour, hashedPassword, emailVerified: new Date() },
    select: { id: true },
  });
}

async function main() {
  console.log(`Seeding the review account on ${isTest ? "bookmark-test" : "a non-test database (--production)"}.`);
  const reviewer = await upsertUser(email!, "appreview", "#2F80ED", await bcrypt.hash(password!, 10));
  // Nobody signs in as the friend: its password is random and thrown away.
  const friend = await upsertUser(friendEmail, "appreviewfriend", "#27AE60", await bcrypt.hash(randomBytes(24).toString("hex"), 10));
  const ids = [reviewer.id, friend.id];

  // Back to a clean slate: circles the friend hosts (members, comments and reports go with them), then
  // the shelves, their reads, follows and goals.
  await prisma.buddyRead.deleteMany({ where: { hostId: friend.id } });
  await prisma.bookRead.deleteMany({ where: { userId: { in: ids } } });
  await prisma.book.deleteMany({ where: { userId: { in: ids } } });
  await prisma.follow.deleteMany({ where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] } });
  await prisma.readingGoal.deleteMany({ where: { userId: { in: ids } } });

  let reviewerCircleBook: string | null = null;
  for (const b of SHELF) {
    const started = b.started ? daysAgo(b.started) : null;
    const finished = b.finished ? daysAgo(b.finished) : null;
    const book = await prisma.book.create({
      data: {
        userId: reviewer.id,
        title: b.title,
        author: b.author,
        coverImage: cover(b.isbn),
        genre: b.genre,
        pages: b.pages,
        status: b.status,
        currentPage: b.status === "COMPLETED" ? b.pages : b.page ?? 0,
        rating: b.rating ?? null,
        review: b.review ?? null,
        timesRead: b.status === "COMPLETED" ? 1 : 0,
        startedAt: started,
        completedAt: finished,
        progressAt: b.status === "STARTED" ? daysAgo(1) : finished,
      },
      select: { id: true },
    });
    if (b.status !== "NOT_STARTED") {
      await prisma.bookRead.create({
        data: { bookId: book.id, userId: reviewer.id, status: b.status, startedAt: started, finishedAt: finished, rating: b.rating ?? null, ...(finished && { pages: b.pages }) },
      });
    }
    if (b.title === "Project Hail Mary") reviewerCircleBook = book.id;
  }

  // The friend reads the same book, further along.
  const hailMary = SHELF[0];
  const friendBook = await prisma.book.create({
    data: { userId: friend.id, title: hailMary.title, author: hailMary.author, coverImage: cover(hailMary.isbn), genre: hailMary.genre, pages: hailMary.pages, status: "STARTED", currentPage: 400, startedAt: daysAgo(12), progressAt: daysAgo(1) },
    select: { id: true },
  });
  await prisma.bookRead.create({ data: { bookId: friendBook.id, userId: friend.id, status: "STARTED", startedAt: daysAgo(12) } });

  await prisma.follow.createMany({ data: [{ followerId: reviewer.id, followingId: friend.id }, { followerId: friend.id, followingId: reviewer.id }] });
  await prisma.readingGoal.create({ data: { userId: reviewer.id, year: new Date().getFullYear(), targetBooks: 12 } });

  const circle = await prisma.buddyRead.create({
    data: {
      title: hailMary.title,
      author: hailMary.author,
      coverImage: cover(hailMary.isbn),
      pages: hailMary.pages,
      hostId: friend.id,
      startsAt: daysAgo(12),
      inviteCode: inviteCode(),
      members: {
        create: [
          { userId: friend.id, bookId: friendBook.id, joinedAt: daysAgo(12), notifiedProgress: 84 },
          { userId: reviewer.id, bookId: reviewerCircleBook!, joinedAt: daysAgo(10), notifiedProgress: 40 },
        ],
      },
    },
    select: { id: true },
  });
  // The reviewer is at 40%: the first comment is open to them, the second stays locked until 75%.
  await prisma.buddyReadComment.createMany({
    data: [
      { buddyReadId: circle.id, userId: friend.id, position: 20, body: "The opening chapters are such a good mystery. Who wakes up not knowing their own name?", createdAt: daysAgo(8) },
      { buddyReadId: circle.id, userId: friend.id, position: 75, body: "I did not see that coming. Tell me when you get here!", createdAt: daysAgo(2) },
    ],
  });

  console.log(`Reviewer appreview (${reviewer.id}) and friend appreviewfriend (${friend.id}) are ready.`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
