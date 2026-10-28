import { NextResponse } from "next/server";
import { handleOf } from "@/lib/handle";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { respondToRequestFrom } from "@/lib/followRequests";

const bodySchema = z.object({ action: z.enum(["accept", "decline"]) }).strict();

// Accept or decline `username`'s request to follow the signed-in reader. The notification bell uses this:
// a FOLLOW_REQUEST notification names the requester, not the request.
export async function POST(req: Request, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const { user, response } = await requireUser();
  if (response) return response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose accept or decline." }, { status: 400 });

  const result = await respondToRequestFrom(user.id, handleOf(params.username), parsed.data.action === "accept");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ accepted: result.accepted });
}
