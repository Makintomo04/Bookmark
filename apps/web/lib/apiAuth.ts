import { NextResponse } from "next/server";
import getCurrentUser, { resolveCurrentUser } from "@/app/actions/getCurrentUser";
import { can, type Permission } from "@/lib/roles";
import { SUSPENDED, SUSPENDED_MESSAGE } from "@/lib/suspension";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function unauthorized(message = "Sign in to continue.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "You don't have access to that.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

type Guarded = { user: CurrentUser; response: null } | { user: null; response: NextResponse };

// Route handlers use it as: const { user, response } = await requireUser(); if (response) return response;
// A signed-out request gets a 401 JSON body instead of the bare 500 that NextResponse.error() sends, and a
// suspended account a 403 with code "suspended" so the apps can say why.
export async function requireUser(message?: string): Promise<Guarded> {
  const { user, suspended } = await resolveCurrentUser();
  if (suspended) return { user: null, response: NextResponse.json({ error: SUSPENDED_MESSAGE, code: SUSPENDED }, { status: 403 }) };
  if (!user) return { user: null, response: unauthorized(message) };
  return { user, response: null };
}

// The same, for the staff tools: also refuses (403) anyone whose role lacks the permission
// (packages/shared/src/roles.ts). Every /api/staff route starts with this.
export async function requirePermission(permission: Permission): Promise<Guarded> {
  const guarded = await requireUser();
  if (guarded.response) return guarded;
  if (!can(guarded.user, permission)) return { user: null, response: forbidden() };
  return guarded;
}
