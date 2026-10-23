// Fills the bookmark-test catalog with romance, romantasy and fantasy works from Open Library, readers'
// mood and warning tags on them, and four readers to walk through Ask the shelf with: someone asking,
// a friend they follow, a reader they share a circle with, and a stranger. Test data only: refuses to
// run anywhere else. Safe to re-run (works are matched by key, tags and shelves are upserted).
//
//   node scripts/with-test-db.mjs node scripts/seed-ask-shelf.ts
//
// Accounts (password for all: see PASSWORD below), all verified, FREE plan:
//   ask-reader@bookmark.test  askreader   follows askfriend; in a circle hosted by askmate
//   ask-friend@bookmark.test  askfriend   rates a handful of books 4 and up
//   ask-mate@bookmark.test    askmate     finished a few books; not followed by askreader
//   ask-other@bookmark.test   askother    tags books, rates some highly; nobody follows them
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const PASSWORD = "ask-the-shelf-2026";
// Matches lib/catalog/resolve.ts SUBJECTS_MAX: the seed stores what a real lookup would.
const SUBJECTS_MAX = 30;
const DESCRIPTION_MAX = 2000;

if (!/bookmark-test/.test(process.env.DATABASE_URL ?? "")) {
  console.error("seed-ask-shelf: only runs against bookmark-test (use scripts/with-test-db.mjs)");
  process.exit(2);
}

const prisma = new PrismaClient();

const READERS = [
  { key: "reader", email: "ask-reader@bookmark.test", username: "askreader", favColour: "#C2255C" },
  { key: "friend", email: "ask-friend@bookmark.test", username: "askfriend", favColour: "#5F3DC4" },
  { key: "mate", email: "ask-mate@bookmark.test", username: "askmate", favColour: "#0B7285" },
  { key: "other", email: "ask-other@bookmark.test", username: "askother", favColour: "#8A6A00" },
] as const;
type ReaderKey = typeof READERS[number]["key"];

type W = [topic: string, level: "MINOR" | "MODERATE" | "GRAPHIC"];
interface SeedBook {
  title: string;
  author: string;
  moods: string[];
  warnings?: W[];
}

// Moods and warnings as readers commonly report them. Test data, not an authority on these books.
const BOOKS: SeedBook[] = [
  // Romantasy
  { title: "A Court of Thorns and Roses", author: "Sarah J. Maas", moods: ["ADVENTUROUS", "DARK", "TENSE"], warnings: [["Sexual content", "GRAPHIC"], ["Violence", "GRAPHIC"], ["Sexual assault", "MODERATE"], ["Torture", "MODERATE"]] },
  { title: "Fourth Wing", author: "Rebecca Yarros", moods: ["ADVENTUROUS", "TENSE", "EMOTIONAL"], warnings: [["Sexual content", "GRAPHIC"], ["Death", "GRAPHIC"], ["Violence", "GRAPHIC"]] },
  { title: "The Cruel Prince", author: "Holly Black", moods: ["DARK", "ADVENTUROUS", "TENSE"], warnings: [["Violence", "MODERATE"], ["Bullying", "MODERATE"], ["Murder", "MODERATE"]] },
  { title: "From Blood and Ash", author: "Jennifer L. Armentrout", moods: ["ADVENTUROUS", "DARK", "TENSE"], warnings: [["Sexual content", "GRAPHIC"], ["Violence", "GRAPHIC"], ["Sexual assault", "MINOR"]] },
  { title: "Serpent & Dove", author: "Shelby Mahurin", moods: ["ADVENTUROUS", "DARK", "TENSE"], warnings: [["Sexual content", "MODERATE"], ["Violence", "MODERATE"]] },
  { title: "Uprooted", author: "Naomi Novik", moods: ["ADVENTUROUS", "DARK", "MYSTERIOUS"], warnings: [["Violence", "MODERATE"], ["Body horror", "MODERATE"]] },
  { title: "Spinning Silver", author: "Naomi Novik", moods: ["ADVENTUROUS", "REFLECTIVE", "MYSTERIOUS"], warnings: [["Domestic violence", "MODERATE"], ["Racism", "MODERATE"]] },
  { title: "The Bridge Kingdom", author: "Danielle L. Jensen", moods: ["ADVENTUROUS", "TENSE", "EMOTIONAL"], warnings: [["Sexual content", "GRAPHIC"], ["Violence", "MODERATE"]] },
  { title: "Divine Rivals", author: "Rebecca Ross", moods: ["EMOTIONAL", "HOPEFUL", "ADVENTUROUS"], warnings: [["War", "MODERATE"], ["Death", "MODERATE"], ["Addiction", "MINOR"]] },
  { title: "Emily Wilde's Encyclopaedia of Faeries", author: "Heather Fawcett", moods: ["LIGHTHEARTED", "MYSTERIOUS", "FUNNY"], warnings: [["Violence", "MINOR"]] },
  { title: "Kingdom of the Wicked", author: "Kerri Maniscalco", moods: ["DARK", "MYSTERIOUS", "TENSE"], warnings: [["Murder", "MODERATE"], ["Sexual content", "MODERATE"]] },
  { title: "The Invisible Life of Addie LaRue", author: "V. E. Schwab", moods: ["REFLECTIVE", "EMOTIONAL", "MYSTERIOUS"], warnings: [["Sexual content", "MINOR"], ["Death", "MINOR"]] },
  // Cosy fantasy
  { title: "Legends & Lattes", author: "Travis Baldree", moods: ["LIGHTHEARTED", "HOPEFUL", "FUNNY"], warnings: [["Violence", "MINOR"]] },
  { title: "The House in the Cerulean Sea", author: "TJ Klune", moods: ["LIGHTHEARTED", "HOPEFUL", "FUNNY", "EMOTIONAL"], warnings: [["Homophobia", "MINOR"], ["Bullying", "MINOR"]] },
  { title: "Under the Whispering Door", author: "TJ Klune", moods: ["EMOTIONAL", "HOPEFUL", "REFLECTIVE"], warnings: [["Death", "MODERATE"], ["Grief", "GRAPHIC"], ["Suicide", "MODERATE"]] },
  { title: "A Psalm for the Wild-Built", author: "Becky Chambers", moods: ["HOPEFUL", "REFLECTIVE", "LIGHTHEARTED"] },
  { title: "The Very Secret Society of Irregular Witches", author: "Sangu Mandanna", moods: ["LIGHTHEARTED", "HOPEFUL", "FUNNY"], warnings: [["Death of a parent", "MINOR"], ["Sexual content", "MODERATE"]] },
  { title: "Howl's Moving Castle", author: "Diana Wynne Jones", moods: ["LIGHTHEARTED", "FUNNY", "ADVENTUROUS"] },
  { title: "The Goblin Emperor", author: "Katherine Addison", moods: ["HOPEFUL", "REFLECTIVE", "MYSTERIOUS"], warnings: [["Death of a parent", "MINOR"], ["Misogyny", "MINOR"]] },
  // Fantasy
  { title: "The Final Empire", author: "Brandon Sanderson", moods: ["ADVENTUROUS", "TENSE", "DARK"], warnings: [["Violence", "GRAPHIC"], ["Slavery", "MODERATE"], ["Death", "MODERATE"]] },
  { title: "The Priory of the Orange Tree", author: "Samantha Shannon", moods: ["ADVENTUROUS", "MYSTERIOUS", "TENSE"], warnings: [["Violence", "MODERATE"], ["Death", "MODERATE"]] },
  { title: "Six of Crows", author: "Leigh Bardugo", moods: ["ADVENTUROUS", "TENSE", "DARK"], warnings: [["Violence", "GRAPHIC"], ["Sexual assault", "MINOR"], ["Drug use", "MINOR"]] },
  { title: "The Night Circus", author: "Erin Morgenstern", moods: ["MYSTERIOUS", "REFLECTIVE", "ADVENTUROUS"], warnings: [["Death", "MINOR"]] },
  { title: "Babel", author: "R. F. Kuang", moods: ["CHALLENGING", "DARK", "REFLECTIVE"], warnings: [["Racism", "GRAPHIC"], ["Violence", "MODERATE"], ["Death", "MODERATE"]] },
  { title: "The Poppy War", author: "R. F. Kuang", moods: ["DARK", "CHALLENGING", "TENSE"], warnings: [["War", "GRAPHIC"], ["Sexual assault", "GRAPHIC"], ["Torture", "GRAPHIC"], ["Gore", "GRAPHIC"]] },
  { title: "Daughter of the Moon Goddess", author: "Sue Lynn Tan", moods: ["ADVENTUROUS", "EMOTIONAL", "HOPEFUL"], warnings: [["Violence", "MINOR"]] },
  { title: "The Song of Achilles", author: "Madeline Miller", moods: ["EMOTIONAL", "REFLECTIVE", "DARK"], warnings: [["War", "MODERATE"], ["Death", "GRAPHIC"], ["Sexual content", "MINOR"]] },
  { title: "Jade City", author: "Fonda Lee", moods: ["TENSE", "DARK", "ADVENTUROUS"], warnings: [["Violence", "GRAPHIC"], ["Murder", "MODERATE"]] },
  { title: "The Fifth Season", author: "N. K. Jemisin", moods: ["DARK", "CHALLENGING", "EMOTIONAL"], warnings: [["Child death", "GRAPHIC"], ["Slavery", "MODERATE"]] },
  { title: "Assassin's Apprentice", author: "Robin Hobb", moods: ["REFLECTIVE", "EMOTIONAL", "ADVENTUROUS"], warnings: [["Animal death", "MODERATE"], ["Child abuse", "MINOR"]] },
  { title: "The Lies of Locke Lamora", author: "Scott Lynch", moods: ["ADVENTUROUS", "FUNNY", "TENSE"], warnings: [["Violence", "GRAPHIC"], ["Torture", "MODERATE"]] },
  { title: "Piranesi", author: "Susanna Clarke", moods: ["MYSTERIOUS", "REFLECTIVE", "HOPEFUL"] },
  { title: "Circe", author: "Madeline Miller", moods: ["REFLECTIVE", "EMOTIONAL", "ADVENTUROUS"], warnings: [["Sexual assault", "MODERATE"], ["Violence", "MODERATE"]] },
  // Romance
  { title: "Beach Read", author: "Emily Henry", moods: ["EMOTIONAL", "FUNNY", "REFLECTIVE"], warnings: [["Death of a parent", "MODERATE"], ["Infidelity", "MINOR"], ["Sexual content", "MODERATE"]] },
  { title: "Book Lovers", author: "Emily Henry", moods: ["FUNNY", "LIGHTHEARTED", "EMOTIONAL"], warnings: [["Sexual content", "MODERATE"], ["Grief", "MINOR"]] },
  { title: "The Love Hypothesis", author: "Ali Hazelwood", moods: ["FUNNY", "LIGHTHEARTED"], warnings: [["Sexual content", "GRAPHIC"], ["Sexual harassment", "MODERATE"]] },
  { title: "Red, White & Royal Blue", author: "Casey McQuiston", moods: ["FUNNY", "LIGHTHEARTED", "HOPEFUL"], warnings: [["Sexual content", "MODERATE"], ["Homophobia", "MINOR"]] },
  { title: "The Hating Game", author: "Sally Thorne", moods: ["FUNNY", "LIGHTHEARTED"], warnings: [["Sexual content", "MODERATE"]] },
  { title: "It Ends with Us", author: "Colleen Hoover", moods: ["EMOTIONAL", "DARK", "CHALLENGING"], warnings: [["Domestic violence", "GRAPHIC"], ["Sexual assault", "MODERATE"]] },
  { title: "Pride and Prejudice", author: "Jane Austen", moods: ["FUNNY", "LIGHTHEARTED", "REFLECTIVE"] },
  { title: "The Flatshare", author: "Beth O'Leary", moods: ["FUNNY", "LIGHTHEARTED", "HOPEFUL"], warnings: [["Emotional abuse", "MODERATE"], ["Stalking", "MINOR"]] },
  { title: "Get a Life, Chloe Brown", author: "Talia Hibbert", moods: ["FUNNY", "LIGHTHEARTED", "EMOTIONAL"], warnings: [["Sexual content", "GRAPHIC"], ["Medical content", "MINOR"]] },
  { title: "People We Meet on Vacation", author: "Emily Henry", moods: ["FUNNY", "EMOTIONAL", "LIGHTHEARTED"], warnings: [["Sexual content", "MODERATE"]] },
  // Elsewhere on the shelf
  { title: "Gone Girl", author: "Gillian Flynn", moods: ["DARK", "TENSE", "MYSTERIOUS"], warnings: [["Murder", "GRAPHIC"], ["Domestic violence", "MODERATE"]] },
  { title: "Mexican Gothic", author: "Silvia Moreno-Garcia", moods: ["DARK", "MYSTERIOUS", "TENSE"], warnings: [["Body horror", "GRAPHIC"], ["Incest", "MODERATE"], ["Sexual assault", "MODERATE"]] },
  { title: "The Seven Husbands of Evelyn Hugo", author: "Taylor Jenkins Reid", moods: ["EMOTIONAL", "REFLECTIVE"], warnings: [["Domestic violence", "MODERATE"], ["Homophobia", "MODERATE"], ["Death", "MODERATE"]] },
];

// Who has what on their shelf, as [title, status, rating?].
type Shelf = [string, "COMPLETED" | "NOT_STARTED" | "STARTED" | "NOT_INTERESTED", number?][];
const SHELVES: Record<ReaderKey, Shelf> = {
  // The asking reader has read some of the obvious answers, so they must not come back.
  reader: [["Fourth Wing", "COMPLETED", 4], ["Legends & Lattes", "COMPLETED", 5], ["The Love Hypothesis", "NOT_STARTED"], ["It Ends with Us", "NOT_INTERESTED"], ["Uprooted", "STARTED"]],
  friend: [["The House in the Cerulean Sea", "COMPLETED", 5], ["Emily Wilde's Encyclopaedia of Faeries", "COMPLETED", 4.5], ["Divine Rivals", "COMPLETED", 4], ["Book Lovers", "COMPLETED", 5], ["The Poppy War", "COMPLETED", 3], ["Six of Crows", "COMPLETED", 4]],
  mate: [["Uprooted", "STARTED"], ["A Psalm for the Wild-Built", "COMPLETED", 4], ["The Night Circus", "COMPLETED"], ["The Priory of the Orange Tree", "COMPLETED", 2]],
  other: [["The Goblin Emperor", "COMPLETED", 5], ["Beach Read", "COMPLETED", 5], ["The Lies of Locke Lamora", "COMPLETED", 5]],
};

const cleanDescription = (raw: string) =>
  raw
    .replace(/\r/g, "")
    .split(/\n-{3,}|\n\*{3,}|\(\[source\]/)[0]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, DESCRIPTION_MAX) || null;

const dedupe = (list: string[]) => {
  const seen = new Set<string>();
  return list.map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
};

async function lookup(book: SeedBook) {
  const fields = "key,title,author_name,cover_i,number_of_pages_median,first_publish_year,subject";
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.author)}&fields=${fields}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Bookmark test seed" } });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const doc = (await res.json())?.docs?.[0];
  if (!doc?.key) return null;
  const workKey = String(doc.key).replace("/works/", "");
  let description: string | null = null;
  const w = await fetch(`https://openlibrary.org/works/${workKey}.json`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (w?.ok) {
    const data = await w.json();
    const raw = typeof data?.description === "string" ? data.description : data?.description?.value;
    if (typeof raw === "string") description = cleanDescription(raw);
  }
  return {
    workKey,
    title: doc.title as string,
    authors: (doc.author_name as string[] | undefined)?.slice(0, 3) ?? [book.author],
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
    pages: typeof doc.number_of_pages_median === "number" ? doc.number_of_pages_median : null,
    year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : null,
    subjects: dedupe((doc.subject as string[] | undefined) ?? []).slice(0, SUBJECTS_MAX),
    description,
  };
}

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const users = {} as Record<ReaderKey, string>;
  for (const r of READERS) {
    const user = await prisma.user.upsert({
      where: { email: r.email },
      create: { email: r.email, username: r.username, favColour: r.favColour, hashedPassword, emailVerified: new Date(), plan: "FREE", timeZone: "Europe/London" },
      update: { username: r.username, hashedPassword, emailVerified: new Date() },
      select: { id: true },
    });
    users[r.key] = user.id;
  }

  // Works, with one edition each carrying the page count.
  const works = new Map<string, { id: string; key: string; title: string; author: string; cover: string | null; pages: number }>();
  for (const book of BOOKS) {
    let found: Awaited<ReturnType<typeof lookup>> = null;
    try {
      found = await lookup(book);
    } catch (err) {
      console.warn(`  ${book.title}: lookup failed (${err instanceof Error ? err.message : err})`);
    }
    if (!found) {
      console.warn(`  ${book.title}: not on Open Library, skipped`);
      continue;
    }
    const key = `ol:${found.workKey}`;
    const existing = await prisma.work.findUnique({ where: { key } });
    const data = {
      openLibraryKey: found.workKey,
      title: found.title,
      authors: found.authors,
      subjects: existing?.subjects.length ? existing.subjects : found.subjects,
      description: existing?.description ?? found.description,
      coverUrl: existing?.coverUrl ?? found.coverUrl,
      firstPublishYear: existing?.firstPublishYear ?? found.year,
    };
    const work = existing ? await prisma.work.update({ where: { key }, data }) : await prisma.work.create({ data: { key, ...data } });
    const pages = found.pages ?? 0;
    if (pages > 0) {
      const editionKey = `generic:${work.id}:PAPERBACK:${pages}`;
      await prisma.edition.upsert({ where: { key: editionKey }, create: { key: editionKey, workId: work.id, format: "PAPERBACK", pages }, update: {} });
    }
    works.set(book.title, { id: work.id, key: found.workKey, title: found.title, author: found.authors[0], cover: work.coverUrl, pages });
    console.log(`  ${found.title}: ${pages || "?"} pages, ${found.subjects.length} subjects, ${found.description ? "description" : "no description"}`);
  }

  // Tags: friend, mate and other each tag the books, so moods read as everyone's.
  for (const book of BOOKS) {
    const work = works.get(book.title);
    if (!work) continue;
    const warnings = (book.warnings ?? []).map(([topic, level]) => ({ topic, level }));
    for (const who of ["friend", "mate", "other"] as const) {
      await prisma.readerTags.upsert({
        where: { workId_userId: { workId: work.id, userId: users[who] } },
        create: { workId: work.id, userId: users[who], moods: book.moods as never, warnings },
        update: { moods: book.moods as never, warnings },
      });
    }
  }

  // Shelves.
  const shelfBookIds = {} as Record<ReaderKey, Map<string, string>>;
  for (const r of READERS) {
    shelfBookIds[r.key] = new Map();
    for (const [title, status, rating] of SHELVES[r.key]) {
      const work = works.get(title);
      if (!work) continue;
      const existing = await prisma.book.findFirst({ where: { userId: users[r.key], workId: work.id }, select: { id: true } });
      const data = {
        title: work.title, author: work.author, coverImage: work.cover ?? "", pages: work.pages, status, rating: rating ?? null,
        workKey: work.key, workId: work.id, completedAt: status === "COMPLETED" ? new Date() : null, timesRead: status === "COMPLETED" ? 1 : 0,
      };
      const book = existing
        ? await prisma.book.update({ where: { id: existing.id }, data })
        : await prisma.book.create({ data: { userId: users[r.key], ...data } });
      shelfBookIds[r.key].set(title, book.id);
    }
  }

  // askreader follows askfriend only.
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: users.reader, followingId: users.friend } },
    create: { followerId: users.reader, followingId: users.friend },
    update: {},
  });

  // A circle hosted by askmate on Uprooted, with askreader in it.
  const uprooted = works.get("Uprooted");
  if (uprooted) {
    const code = "ASKSHELF";
    const circle = await prisma.buddyRead.upsert({
      where: { inviteCode: code },
      create: { inviteCode: code, hostId: users.mate, workKey: uprooted.key, title: uprooted.title, author: uprooted.author, coverImage: uprooted.cover, pages: uprooted.pages || 400, startsAt: new Date() },
      update: {},
    });
    for (const who of ["mate", "reader"] as const) {
      const bookId = shelfBookIds[who].get("Uprooted");
      if (!bookId) continue;
      await prisma.buddyReadMember.upsert({
        where: { buddyReadId_userId: { buddyReadId: circle.id, userId: users[who] } },
        create: { buddyReadId: circle.id, userId: users[who], bookId },
        update: { bookId },
      });
    }
  }

  // Start each run with a clean month of searches for the asking reader.
  await prisma.aiUsage.deleteMany({ where: { userId: users.reader } });

  console.log(`\n${works.size} works; readers: ${READERS.map((r) => `${r.username} ${users[r.key]}`).join(", ")}`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
