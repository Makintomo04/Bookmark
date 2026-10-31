// Creates (or refills) a reader with a 2,000-book library on the bookmark-test database, for measuring how
// the shelf copes with a big imported library. Real titles, authors and Open Library covers, a Goodreads-like
// mix of shelves, reviews on about a third of finished books, and filing tags. Test data only.
//
//   node scripts/with-test-db.mjs node scripts/seed-big-shelf.ts [count] [username]
//
// Account: big-shelf@bookmark.test, username bigshelf (password: see PASSWORD below), or the name given. Running it again
// deletes that reader's books and seeds them afresh.
import { PrismaClient, type Status } from "@prisma/client";
import bcrypt from "bcrypt";

const PASSWORD = "read-together-2026";
const COUNT = Number(process.argv[2]) || 2000;
// Another reader's name, to keep two library sizes side by side (smallshelf → small-shelf@bookmark.test).
const USERNAME = process.argv[3] || "bigshelf";
const EMAIL = `${USERNAME.replace(/shelf$/, "-shelf")}@bookmark.test`;
const SUBJECTS = [
  "fantasy", "science_fiction", "romance", "mystery_and_detective_stories", "thriller", "historical_fiction",
  "horror", "young_adult_fiction", "biography", "literature", "humor", "poetry",
];

if (!/bookmark-test/.test(process.env.DATABASE_URL ?? "")) {
  console.error("seed-big-shelf: only runs against bookmark-test (use scripts/with-test-db.mjs)");
  process.exit(2);
}

const prisma = new PrismaClient();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
// Seeded, so two runs give the same library.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

interface Work { title: string; author: string; workKey: string; coverId: number; subject: string }

async function fetchWorks(): Promise<Work[]> {
  const works = new Map<string, Work>();
  const per = Math.ceil((COUNT * 1.3) / SUBJECTS.length);
  for (const subject of SUBJECTS) {
    for (let offset = 0; offset < per; offset += 200) {
      const res = await fetch(`https://openlibrary.org/subjects/${subject}.json?limit=200&offset=${offset}`);
      if (!res.ok) break;
      const body = await res.json() as { works: { key: string; title: string; cover_id: number | null; authors: { name: string }[] }[] };
      for (const w of body.works) {
        if (!w.cover_id || !w.authors?.[0]) continue;
        const workKey = w.key.replace("/works/", "");
        if (!works.has(workKey)) works.set(workKey, { title: w.title, author: w.authors[0].name, workKey, coverId: w.cover_id, subject });
      }
      if (body.works.length < 200) break;
    }
    console.log(`${subject}: ${works.size} works so far`);
  }
  return [...works.values()];
}

const REVIEW = "Took me a while to get into this one, but once the second act landed I couldn't put it down. The prose is " +
  "careful without being precious, and the side characters carry more of the book than you'd expect. ";
const TAGS = ["owned", "kindle", "library", "book-club-2023", "audible", "favourites", "to-reread", "signed", "gift"];

function statusFor(i: number): Status {
  const r = rand();
  if (i < 4) return "STARTED";
  if (r < 0.62) return "COMPLETED";
  if (r < 0.9) return "NOT_STARTED";
  if (r < 0.95) return "DNF";
  if (r < 0.98) return "PAUSED";
  return "NOT_INTERESTED";
}

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, username: USERNAME, favColour: "#9B51E0", hashedPassword, emailVerified: new Date() },
    update: { username: USERNAME, hashedPassword, emailVerified: new Date() },
    select: { id: true },
  });
  await prisma.book.deleteMany({ where: { userId: user.id } });

  const works = (await fetchWorks()).slice(0, COUNT);
  if (works.length < COUNT) console.warn(`Only found ${works.length} works with covers`);
  const rows = works.map((w, i) => {
    const status = statusFor(i);
    const pages = 180 + Math.floor(rand() * 520);
    const added = Math.floor(rand() * 3000);
    const finished = status === "COMPLETED";
    const reviewed = finished && rand() < 0.35;
    return {
      userId: user.id,
      title: w.title,
      author: w.author,
      coverImage: `https://covers.openlibrary.org/b/id/${w.coverId}-L.jpg`,
      status,
      genre: w.subject.replace(/_/g, " "),
      pages,
      currentPage: finished ? pages : status === "STARTED" || status === "DNF" || status === "PAUSED" ? Math.floor(pages * rand()) : 0,
      rating: finished && rand() < 0.85 ? Math.ceil(rand() * 20) / 4 : null,
      timesRead: finished ? 1 : 0,
      review: reviewed ? REVIEW.repeat(1 + Math.floor(rand() * 5)) : null,
      tags: rand() < 0.4 ? [pick(TAGS), ...(rand() < 0.3 ? [pick(TAGS)] : [])] : [],
      workKey: w.workKey,
      createdAt: daysAgo(added),
      startedAt: status === "NOT_STARTED" || status === "NOT_INTERESTED" ? null : daysAgo(Math.max(0, added - 5)),
      completedAt: finished ? daysAgo(Math.max(0, added - 20)) : null,
      stoppedAt: status === "DNF" || status === "PAUSED" ? daysAgo(Math.max(0, added - 10)) : null,
    };
  });
  for (let i = 0; i < rows.length; i += 500) await prisma.book.createMany({ data: rows.slice(i, i + 500) });
  const counts = await prisma.book.groupBy({ by: ["status"], where: { userId: user.id }, _count: true });
  console.log(`${USERNAME}: ${user.id}, ${rows.length} books`, Object.fromEntries(counts.map((c) => [c.status, c._count])));
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
