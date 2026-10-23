// Creates (or resets) verified reader accounts on the bookmark-test database, for walking through
// circles with two people without a real inbox. Test data only: refuse to run anywhere else.
//
//   node scripts/with-test-db.mjs node scripts/seed-test-readers.ts
//
// Accounts (password for both: see PASSWORD below):
//   circle-host@bookmark.test   username circlehost
//   circle-guest@bookmark.test  username circleguest
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const PASSWORD = "read-together-2026";
const READERS = [
  { email: "circle-host@bookmark.test", username: "circlehost", favColour: "#2F80ED" },
  { email: "circle-guest@bookmark.test", username: "circleguest", favColour: "#27AE60" },
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
      create: { email: r.email, username: r.username, favColour: r.favColour, hashedPassword, emailVerified: new Date() },
      update: { username: r.username, hashedPassword, emailVerified: new Date() },
      select: { id: true, username: true },
    });
    console.log(`${user.username}: ${user.id}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
