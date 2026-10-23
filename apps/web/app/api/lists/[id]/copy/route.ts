import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { copyList } from "@/lib/lists";

type Params = { params: { id: string } };

// "Copy to my lists": makes a private remix of someone else's public list.
export async function POST(req: Request, { params }: Params) {
  const { user: currentUser, response } = await requireUser("Sign in to copy this list.");
  if (response) return response;
  const result = await copyList(params.id, currentUser);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ id: result.id });
}
