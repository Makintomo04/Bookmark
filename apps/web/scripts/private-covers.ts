// One-off clean-up for uploads staying private (lib/uploads.ts). Records the uploads made before the Upload
// model, and takes every reader's upload out of the places others see covers: the catalogue, reading
// circles, lists, and other readers' shelf copies. The rules are in lib/coverCleanup.ts.
//
// A dry run by default: it prints what it would change and changes nothing. Read that first.
//
//   node scripts/with-test-db.mjs node scripts/private-covers.ts            (bookmark-test, dry run)
//   node scripts/with-test-db.mjs node scripts/private-covers.ts --apply
//   node scripts/private-covers.ts --production [--apply]                     (anything else)
//
// It asks UploadThing's file server for each unrecorded file's stored name (one request per file, a few
// at a time): our copies of Open Library covers are named after the cover, uploads aren't.
import { PrismaClient } from "@prisma/client";
import { planCoverCleanup, type CleanupSnapshot } from "../lib/coverCleanup.ts";
import { isOpenLibraryCopyName, uploadThingKey } from "../lib/uploadedImages.ts";

const apply = process.argv.includes("--apply");
const isTest = /bookmark-test/.test(process.env.DATABASE_URL ?? "");
if (!isTest && !process.argv.includes("--production")) {
  console.error("private-covers: DATABASE_URL isn't bookmark-test. Pass --production to run it anyway.");
  process.exit(2);
}

const prisma = new PrismaClient();
const UT = { OR: [{ contains: "utfs.io/" }, { contains: ".ufs.sh/" }] };
const ut = (field: string) => ({ OR: UT.OR.map((c) => ({ [field]: c })) });

// The name the file was stored under, from the file server's Content-Disposition. Null when unreadable.
async function storedName(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const header = res.headers.get("content-disposition") ?? "";
    const match = header.match(/filename\*=UTF-8''([^;]+)/i) ?? header.match(/filename="?([^";]+)"?/i);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`private-covers on ${isTest ? "bookmark-test" : "a non-test database (--production)"}${apply ? "" : " (dry run: nothing is changed)"}`);

  const [users, books, editions, works, items, circles, uploads] = await Promise.all([
    prisma.user.findMany({ where: { OR: [...ut("image").OR, ...ut("banner").OR] }, select: { id: true, image: true, banner: true } }),
    prisma.book.findMany({ where: ut("coverImage"), select: { id: true, userId: true, coverImage: true, editionId: true, workId: true, workKey: true, createdAt: true } }),
    prisma.edition.findMany({ select: { id: true, workId: true, coverUrl: true } }),
    prisma.work.findMany({ select: { id: true, openLibraryKey: true, coverUrl: true } }),
    prisma.listItem.findMany({ where: ut("coverUrl"), select: { id: true, workKey: true, coverUrl: true, list: { select: { ownerId: true } } } }),
    prisma.buddyRead.findMany({ where: ut("coverImage"), select: { id: true, hostId: true, workKey: true, coverImage: true } }),
    prisma.upload.findMany({ select: { key: true, userId: true } }),
  ]);
  const recorded = new Map(uploads.map((u) => [u.key, u.userId]));

  // Every file the data points at; the unrecorded ones get their stored name looked up.
  const urls = new Map<string, string>();
  const note = (url: string | null | undefined) => {
    const key = uploadThingKey(url);
    if (key && url && !urls.has(key)) urls.set(key, url);
  };
  users.forEach((u) => { note(u.image); note(u.banner); });
  books.forEach((b) => note(b.coverImage));
  editions.forEach((e) => note(e.coverUrl));
  works.forEach((w) => note(w.coverUrl));
  items.forEach((i) => note(i.coverUrl));
  circles.forEach((c) => note(c.coverImage));

  const toCheck = Array.from(urls).filter(([key]) => !recorded.has(key));
  console.log(`${urls.size} stored image(s) in use, ${recorded.size} recorded upload(s); reading ${toCheck.length} file name(s)…`);
  const fileNames = new Map<string, string | null>();
  for (let i = 0; i < toCheck.length; i += 8) {
    const batch = toCheck.slice(i, i + 8);
    const names = await Promise.all(batch.map(([, url]) => storedName(url)));
    batch.forEach(([key], n) => fileNames.set(key, names[n]));
  }
  for (const key of Array.from(recorded.keys())) if (urls.has(key)) fileNames.set(key, "(recorded upload)");

  const snapshot: CleanupSnapshot = {
    fileNames,
    uploads: recorded,
    users,
    books,
    editions,
    works,
    listItems: items.map((i) => ({ id: i.id, ownerId: i.list.ownerId, workKey: i.workKey, coverUrl: i.coverUrl })),
    circles,
  };
  const plan = planCoverCleanup(snapshot);

  const sample = <T,>(rows: T[], show: (r: T) => string) => rows.slice(0, 5).map((r) => `    ${show(r)}`).join("\n");
  const names = Array.from(fileNames.values()).filter((n): n is string => !!n && n !== "(recorded upload)");
  const copies = names.filter(isOpenLibraryCopyName);
  console.log(`
Read names: ${copies.length} our copies of Open Library covers, ${names.length - copies.length} uploads
${sample(names.filter((n) => !isOpenLibraryCopyName(n)), (n) => n)}
Uploads to record (from before the Upload model): ${plan.record.length}
${sample(plan.record, (r) => `${r.kind} ${r.key} → user ${r.userId}`)}
Catalogue editions losing an uploaded cover: ${plan.editions.length}
Catalogue works losing an uploaded cover: ${plan.works.length}
Reading circles switching to the catalogue cover (or none): ${plan.circles.length}
${sample(plan.circles, (c) => `${c.id} → ${c.coverImage ?? "title card"}`)}
List items switching to the catalogue cover (or none): ${plan.listItems.length}
Other readers' shelf copies switching to the catalogue cover (or the title card): ${plan.books.length}
${sample(plan.books, (b) => `${b.id} → ${b.coverImage || "title card"}`)}
Uploads only in shared places, owner unknown (still taken out): ${plan.ownerUnknown.length}
Files whose names couldn't be read (left alone): ${plan.unreadable.length}
${sample(plan.unreadable, (k) => k)}`);

  if (!apply) {
    console.log("\nDry run: nothing changed. Run again with --apply to make these changes.");
    return;
  }
  for (const r of plan.record) await prisma.upload.upsert({ where: { key: r.key }, create: r, update: {} });
  for (const e of plan.editions) await prisma.edition.update({ where: { id: e.id }, data: { coverUrl: null } });
  for (const w of plan.works) await prisma.work.update({ where: { id: w.id }, data: { coverUrl: null } });
  for (const c of plan.circles) await prisma.buddyRead.update({ where: { id: c.id }, data: { coverImage: c.coverImage } });
  for (const i of plan.listItems) await prisma.listItem.update({ where: { id: i.id }, data: { coverUrl: i.coverUrl } });
  for (const b of plan.books) await prisma.book.update({ where: { id: b.id }, data: { coverImage: b.coverImage } });
  console.log("\nApplied.");
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
