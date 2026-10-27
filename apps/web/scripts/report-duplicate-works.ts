// Read-only: how much of the shared catalog (Work in prisma/schema.prisma) is the same book filed more than
// once, and which entries are box sets or not novels. Each duplicate splits what Bookmark keeps per book:
// mood tags and content warnings, "read by people you follow", reading circles and Ask the shelf. This
// changes nothing; it's the measurement to take before deciding how to merge.
//
//   node --env-file=.env.local scripts/report-duplicate-works.ts              # whatever DATABASE_URL is
//   node scripts/with-test-db.mjs node scripts/report-duplicate-works.ts      # the test database
//   node --env-file=.env.local scripts/report-duplicate-works.ts --all        # every group, not the top 40
//
// Duplicates are works whose first author and title match once case, series suffixes ("- Flight & Glory
// #4") and edition tags ("(Special Edition)") are set aside: the same rule author pages use
// (lib/bookListCleanup.ts titleKey).
import { PrismaClient } from "@prisma/client";
import { authorSlug } from "@bookmark/shared/authors";
import { dropReason, titleKey } from "../lib/bookListCleanup.ts";

const prisma = new PrismaClient();
const showAll = process.argv.includes("--all");
const TOP = 40;

async function main() {
  const [works, books, tags] = await Promise.all([
    prisma.work.findMany({ select: { id: true, key: true, title: true, authors: true, coverUrl: true } }),
    prisma.book.groupBy({ by: ["workId"], _count: { _all: true }, where: { workId: { not: null } } }),
    prisma.readerTags.groupBy({ by: ["workId"], _count: { _all: true } }),
  ]);
  const shelved = new Map(books.map((b) => [b.workId, b._count._all]));
  const tagged = new Map(tags.map((t) => [t.workId, t._count._all]));

  const groups = new Map<string, typeof works>();
  for (const w of works) {
    const group = `${authorSlug(w.authors[0] ?? "")}|${titleKey(w.title)}`;
    groups.set(group, [...(groups.get(group) ?? []), w]);
  }
  const duplicates = Array.from(groups.values())
    .filter((g) => g.length > 1)
    .sort((a, b) => b.reduce((n, w) => n + (shelved.get(w.id) ?? 0), 0) - a.reduce((n, w) => n + (shelved.get(w.id) ?? 0), 0));

  const extraEntries = duplicates.reduce((n, g) => n + g.length - 1, 0);
  const splitCopies = duplicates.reduce((n, g) => n + g.reduce((m, w) => m + (shelved.get(w.id) ?? 0), 0), 0);
  const flagged = works.flatMap((w) => {
    const reason = dropReason({ title: w.title, coverUrl: w.coverUrl }, false, []);
    return reason ? [{ w, reason }] : [];
  });

  console.log(`Catalog: ${works.length} works, ${books.reduce((n, b) => n + b._count._all, 0)} shelf copies filed under them.`);
  console.log(`Duplicate groups: ${duplicates.length} books filed more than once, ${extraEntries} extra entries, ${splitCopies} shelf copies across them.`);
  console.log(`Box sets and non-novels: ${flagged.length} entries.\n`);

  for (const g of showAll ? duplicates : duplicates.slice(0, TOP)) {
    console.log(`${g[0].title} by ${g[0].authors[0] ?? "?"}`);
    for (const w of g) console.log(`   ${w.key.padEnd(28)} ${String(shelved.get(w.id) ?? 0).padStart(4)} shelved  ${String(tagged.get(w.id) ?? 0).padStart(3)} tagged   "${w.title}"`);
  }
  if (!showAll && duplicates.length > TOP) console.log(`\n…and ${duplicates.length - TOP} more groups (--all to list them).`);

  if (flagged.length > 0) {
    console.log("\nBox sets and non-novels:");
    for (const { w, reason } of showAll ? flagged : flagged.slice(0, TOP)) console.log(`   ${reason.padEnd(12)} ${String(shelved.get(w.id) ?? 0).padStart(4)} shelved   "${w.title}" by ${w.authors[0] ?? "?"}`);
  }
}

main().finally(() => prisma.$disconnect());
