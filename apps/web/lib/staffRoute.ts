import { NextResponse } from "next/server";

// Shared by the /api/staff routes: the staff libs return { ok: true, value } or the message the console
// shows, and these turn that into a response.
export type StaffOutcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export const staffFail = (status: number, error: string) => ({ ok: false, status, error }) as const;

export function staffAnswer<T>(result: StaffOutcome<T>) {
  return result.ok ? NextResponse.json(result.value) : NextResponse.json({ error: result.error }, { status: result.status });
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" ? body : {};
}
