// Lowercases any stored username that still has capitals, from before usernames were normalised
// (packages/shared/src/profile.ts). Every lookup lowercases what it's given (lib/handle.ts), so an
// account whose stored name is "Persona" can't be reached at /u/persona until this has run.
//
//   node --env-file=.env.local scripts/lowercase-usernames.ts           # prints the plan, changes nothing
//   node --env-file=.env.local scripts/lowercase-usernames.ts --apply   # writes it
//   node scripts/with-test-db.mjs node scripts/lowercase-usernames.ts --apply
//
// Refuses to touch an account whose lowercase name another account already holds, or would also take
// ("Alice" and "alice", or "Alice" and "ALICE"): those are printed and left for a person to settle, and
// the rest are still changed. Nothing else about the account changes; follows, lists and circles are
// keyed by id, so links in the app keep working, and the old mixed-case address now reaches the same
// profile anyway.
import { PrismaClient } from "@prisma/client";
import { planLowercaseUsernames } from "../lib/lowercaseUsernames.ts";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

async function main() {
  // Mongo has no case-insensitive index to lean on, so read every username and plan in memory.
  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  const { changes, collisions } = planLowercaseUsernames(users);

  for (const c of collisions) {
    console.log(`collision: "${c.username}" would belong to ${c.accounts.map((a) => `${a.id} (${a.username})`).join(", ")}; left as they are`);
  }
  if (changes.length === 0) {
    console.log(collisions.length ? "Nothing else to change." : "Every username is already lowercase.");
    return;
  }
  for (const c of changes) console.log(`${apply ? "" : "would change "}${c.id}: ${c.from} -> ${c.to}`);
  if (!apply) {
    console.log(`\n${changes.length} to change. Run again with --apply to write them.`);
    return;
  }
  for (const c of changes) {
    // The unique index catches a name claimed between the plan and the write.
    await prisma.user.update({ where: { id: c.id }, data: { username: c.to } });
  }
  console.log(`\nChanged ${changes.length}.${collisions.length ? ` ${collisions.length} collision${collisions.length === 1 ? "" : "s"} left for you.` : ""}`);
  if (collisions.length) process.exitCode = 2;
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); }).finally(() => prisma.$disconnect());
