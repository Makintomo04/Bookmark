import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { respondToRequest } from "@/lib/followRequests";

const bodySchema = z.object({ action: z.enum(["accept", "decline"]) }).strict();

// Accept or decline a follow request sent to the signed-in reader.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireUser();
  if (response) return response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose accept or decline." }, { status: 400 });

  const result = await respondToRequest(user.id, params.id, parsed.data.action === "accept");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ accepted: result.accepted });
}
