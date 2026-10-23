import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { pendingRequestsFor } from "@/lib/followRequests";

// The signed-in reader's pending follow requests.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json(await pendingRequestsFor(user.id), { headers: { "Cache-Control": "private, no-store" } });
}
