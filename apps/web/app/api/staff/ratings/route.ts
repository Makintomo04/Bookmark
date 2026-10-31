import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { heldQueue, spikeQueue } from "@/lib/ratingSpikes";

// /staff/ratings: ?view=held lists books with ratings held out of the average; otherwise the bursts waiting.
export async function GET(req: Request) {
  const { response } = await requirePermission("reports.review");
  if (response) return response;
  const held = new URL(req.url).searchParams.get("view") === "held";
  return NextResponse.json(held ? await heldQueue() : await spikeQueue());
}
