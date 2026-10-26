// Sets a staff role from the command line. Used for the first admin, since the console only lets an
// admin change readers and librarians (packages/shared/src/roles.ts canActOn), and for taking a role
// off an admin, which the console doesn't allow either.
//
//   node --env-file=.env.local scripts/set-role.ts <username or email> READER|LIBRARIAN|ADMIN
//   node scripts/with-test-db.mjs node scripts/set-role.ts <username or email> ADMIN
//
// The change is written to the staff log as made by the account itself, with reason "set-role script".
import { PrismaClient } from "@prisma/client";

const ROLES = ["READER", "LIBRARIAN", "ADMIN"];
const [who, role] = process.argv.slice(2);
if (!who || !ROLES.includes(role ?? "")) {
  console.error("usage: node scripts/set-role.ts <username or email> READER|LIBRARIAN|ADMIN");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: who.replace(/^@/, "") }, { email: { equals: who, mode: "insensitive" } }] },
    select: { id: true, username: true, email: true, role: true, isStaff: true },
  });
  if (!user) throw new Error(`No account with username or email "${who}".`);
  const before = user.role ?? (user.isStaff ? "ADMIN (from isStaff)" : "READER");
  // isStaff is cleared so the old flag can't bring a role back.
  await prisma.user.update({ where: { id: user.id }, data: { role, isStaff: false, roleWelcomedAs: null } });
  await prisma.staffAction.create({
    data: { actorId: user.id, action: "role.set", targetType: "user", targetId: user.id, before: { role: before }, after: { role }, reason: "set-role script" },
  });
  console.log(`${user.username ?? user.email}: ${before} -> ${role}`);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); }).finally(() => prisma.$disconnect());
