// Sets a staff role from the command line. Used for the first admin, since the console only lets an
// admin change readers and librarians (packages/shared/src/roles.ts canActOn), and for taking a role
// off an admin, which the console doesn't allow either.
//
//   node --env-file=.env.local scripts/set-role.ts <username or email> READER|LIBRARIAN|ADMIN --by <your username> --reason "why"
//   node scripts/with-test-db.mjs node scripts/set-role.ts <username or email> ADMIN --by <your username> --reason "why"
//
// The change is written to the staff log as made by the operator named with --by, with their reason.
// For the very first admin, --by can name the account itself.
import { PrismaClient } from "@prisma/client";

const ROLES = ["READER", "LIBRARIAN", "ADMIN"];
const USAGE = 'usage: node scripts/set-role.ts <username or email> READER|LIBRARIAN|ADMIN --by <your username> --reason "why"';

// Positional arguments, and the values after --by and --reason.
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]?.trim() || null : null;
};
const positional = args.filter((arg, i) => !arg.startsWith("--") && !["--by", "--reason"].includes(args[i - 1] ?? ""));
const [who, role] = positional;
const by = flag("--by");
const reason = flag("--reason");
if (!who || !ROLES.includes(role ?? "") || !by || !reason) {
  console.error(USAGE);
  process.exit(1);
}

const prisma = new PrismaClient();

const findAccount = (handle: string) => prisma.user.findFirst({
  where: { OR: [{ username: handle.replace(/^@/, "") }, { email: { equals: handle, mode: "insensitive" } }] },
  select: { id: true, username: true, email: true, role: true, isStaff: true },
});

async function main() {
  const [user, operator] = await Promise.all([findAccount(who), findAccount(by!)]);
  if (!user) throw new Error(`No account with username or email "${who}".`);
  if (!operator) throw new Error(`No account with username or email "${by}" for --by.`);
  const before = user.role ?? (user.isStaff ? "ADMIN (from isStaff)" : "READER");
  // isStaff is cleared so the old flag can't bring a role back.
  await prisma.user.update({ where: { id: user.id }, data: { role, isStaff: false, roleWelcomedAs: null } });
  await prisma.staffAction.create({
    data: { actorId: operator.id, action: "role.set", targetType: "user", targetId: user.id, before: { role: before }, after: { role }, reason: `${reason!.slice(0, 500)} (set-role script)` },
  });
  console.log(`${user.username ?? user.email}: ${before} -> ${role} (by ${operator.username ?? operator.email})`);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); }).finally(() => prisma.$disconnect());
