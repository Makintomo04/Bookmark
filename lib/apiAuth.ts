import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function unauthorized(message = "Sign in to continue.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

// Route handlers use it as: const { user, response } = await requireUser(); if (response) return response;
// A signed-out request gets a 401 JSON body instead of the bare 500 that NextResponse.error() sends.
export async function requireUser(message?: string): Promise<
  { user: CurrentUser; response: null } | { user: null; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: unauthorized(message) };
  return { user, response: null };
}
