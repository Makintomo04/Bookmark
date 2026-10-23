import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { isObjectId } from "@/lib/buddyReadsServer";
import { acceptRecommendation } from "@/lib/recommendations";

// The recipient adds a recommended book to Want to read.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  if (!isObjectId(params.id)) return NextResponse.json({ error: "That recommendation has gone." }, { status: 404 });
  const result = await acceptRecommendation(params.id, currentUser.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
