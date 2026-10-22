// Sets a reader's Bookmark Plus plan directly, for testing the gates without Stripe. Stripe's
// webhook is the only writer in production; this stands in for it locally.
//
//   node scripts/with-test-db.mjs node scripts/set-plan.ts <username> plus|free
//
// Refuses to run against anything but the bookmark-test database.
import { PrismaClient } from "@prisma/client";

const [username, plan] = process.argv.slice(2);
if (!username || !["plus", "free"].includes(plan ?? "")) {
  console.error("usage: node scripts/set-plan.ts <username> plus|free");
  process.exit(1);
}
if (!/\/bookmark-test(\?|$)/.test(process.env.DATABASE_URL ?? "")) {
  console.error("set-plan: only runs against the bookmark-test database (use scripts/with-test-db.mjs)");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const plus = plan === "plus";
  const user = await prisma.user.update({
    where: { username },
    data: { plan: plus ? "PLUS" : "FREE", planRenewsAt: plus ? new Date(Date.now() + 30 * 86_400_000) : null },
    select: { id: true, username: true, plan: true, planRenewsAt: true },
  });
  console.log(user);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
