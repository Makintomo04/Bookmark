// Creates the first two seasonal quests.
//
//   node --env-file=.env.local scripts/seed-quests.ts --dry-run          # show what would be created
//   node --env-file=.env.local scripts/seed-quests.ts                    # create them
//   node --env-file=.env.local scripts/seed-quests.ts --list=<listId>    # link "Autumn of Staff Picks" to this list
//
// Safe to re-run: quests are matched by slug, and one that already exists is left exactly as it is, so
// edits made since on /quests are never overwritten. Run `prisma db push` first so the Quest and
// QuestProgress collections and their indexes exist.
//
// The creator is the oldest staff account (User.isStaff). "Autumn of Staff Picks" needs a Bookmark Pick:
// --list=<id>, or else the most recently updated public, visible Pick. Without one it's skipped.
// Goal shapes follow QuestGoal in lib/quests.ts (kept self-contained here so plain Node can run it).
import { PrismaClient, type Prisma } from "@prisma/client";

const dryRun = process.argv.includes("--dry-run");
const listArg = process.argv.find((a) => a.startsWith("--list="))?.slice("--list=".length);
const prisma = new PrismaClient();

const day = (iso: string, endOfDay = false) => new Date(`${iso}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);

async function main() {
  const staff = await prisma.user.findFirst({ where: { isStaff: true }, orderBy: { createdAt: "asc" }, select: { id: true, username: true } });
  if (!staff) throw new Error("No staff account (User.isStaff) to own the quests. Set isStaff on one first.");

  const pick = listArg
    ? await prisma.list.findUnique({ where: { id: listArg }, select: { id: true, title: true } })
    : await prisma.list.findFirst({
        where: { isPick: true, hidden: false, visibility: "PUBLIC" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true },
      });
  if (listArg && !pick) throw new Error(`No list with id ${listArg}.`);

  const quests: Omit<Prisma.QuestCreateInput, "createdById">[] = [];
  if (pick) {
    quests.push({
      slug: "autumn-of-staff-picks",
      title: "Autumn of Staff Picks",
      description:
        "Long evenings, a stack of team favourites. Finish three books from our Bookmark Pick before the end of November to earn the Autumn medal.",
      startsAt: day("2026-10-01"),
      endsAt: day("2026-11-30", true),
      goal: { type: "list", count: 3, listId: pick.id },
      medalColour: "#B4532A",
      ribbonColour: "#5B3A1E",
      medalIcon: "leaf",
      hidden: false,
    });
  } else {
    console.warn('Skipping "Autumn of Staff Picks": no Bookmark Pick to link. Pass --list=<id> or make a Pick first.');
  }
  quests.push({
    slug: "winter-doorstoppers",
    title: "Winter Doorstoppers",
    description:
      "The season for the big ones. Finish three books of 600 pages or more between December and February to earn the Doorstopper medal. Page counts come from Open Library where we can match the book.",
    startsAt: day("2026-12-01"),
    endsAt: day("2027-02-28", true),
    goal: { type: "pages", count: 3, minPages: 600 },
    medalColour: "#2F5D7C",
    ribbonColour: "#C9D6DF",
    medalIcon: "snowflake",
    hidden: false,
  });

  console.log(`Owner: ${staff.username ?? staff.id}${pick ? `, linked list: ${pick.title}` : ""}${dryRun ? " (dry run, nothing is saved)" : ""}`);
  for (const quest of quests) {
    const existing = await prisma.quest.findUnique({ where: { slug: quest.slug }, select: { id: true } });
    if (existing) {
      console.log(`  ${quest.slug}: already there (${existing.id}), left as is`);
      continue;
    }
    if (dryRun) {
      console.log(`  ${quest.slug}: would create`);
      continue;
    }
    // upsert, not create, so two runs at once can't make a duplicate (slug is unique either way).
    const saved = await prisma.quest.upsert({
      where: { slug: quest.slug },
      create: { ...quest, createdById: staff.id },
      update: {},
    });
    console.log(`  ${quest.slug}: created (${saved.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
