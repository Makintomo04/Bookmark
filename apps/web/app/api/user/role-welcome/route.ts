import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { roleToWelcome } from "@/lib/roleWelcome";
import { NextResponse } from "next/server";

// The role welcome was seen (components/staff/RoleWelcome.tsx). Records the role the account holds now,
// read on the server, so the client can't mark a role it doesn't have.
export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;
  const role = roleToWelcome(user);
  if (role) await prisma.user.update({ where: { id: user.id }, data: { roleWelcomedAs: role } });
  return NextResponse.json({ roleWelcomedAs: role ?? user.roleWelcomedAs ?? null });
}
