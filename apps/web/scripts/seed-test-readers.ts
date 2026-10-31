// Creates (or resets) verified reader accounts on the bookmark-test database, for walking through
// circles with two people without a real inbox. Test data only: refuse to run anywhere else.
//
//   node scripts/with-test-db.mjs node scripts/seed-test-readers.ts
//
// Accounts (password for all: see PASSWORD below):
//   circle-host@bookmark.test   username circlehost
//   circle-guest@bookmark.test  username circleguest
//   first-run@bookmark.test     username firstrun: a brand-new reader (BOO-52) with two favourite genres,
//                               following circlehost, and an empty shelf. Reset to empty on every run.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const PASSWORD = "read-together-2026";
const READERS = [
  { email: "circle-host@bookmark.test", username: "circlehost", favColour: "#2F80ED" },
  { email: "circle-guest@bookmark.test", username: "circleguest", favColour: "#27AE60" },
  { email: "first-run@bookmark.test", username: "firstrun", favColour: "#E67700", favGenres: ["fantasy", "mystery-thriller"], follows: "circlehost", emptyShelf: true },
];

if (!/bookmark-test/.test(process.env.DATABASE_URL ?? "")) {
  console.error("seed-test-readers: only runs against bookmark-test (use scripts/with-test-db.mjs)");
  process.exit(2);
}

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  for (const r of READERS) {
    const user = await prisma.user.upsert({
      where: { email: r.email },
      create: { email: r.email, username: r.username, favColour: r.favColour, favGenres: r.favGenres ?? [], hashedPassword, emailVerified: new Date() },
      update: { username: r.username, hashedPassword, emailVerified: new Date(), ...(r.favGenres && { favGenres: r.favGenres }) },
      select: { id: true, username: true },
    });
    if (r.emptyShelf) await prisma.book.deleteMany({ where: { userId: user.id } });
    if (r.follows) {
      const followed = await prisma.user.findFirst({ where: { username: r.follows }, select: { id: true } });
      if (followed) {
        await prisma.follow.upsert({
          where: { followerId_followingId: { followerId: user.id, followingId: followed.id } },
          create: { followerId: user.id, followingId: followed.id },
          update: {},
        });
      }
    }
    console.log(`${user.username}: ${user.id}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
