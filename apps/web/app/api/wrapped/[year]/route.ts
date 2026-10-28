import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { canViewUser } from "@/lib/privacy";
import { getWrapped, getWrappedOwner, getWrappedYears, parseWrappedYear } from "@/lib/stats";

// A year's Wrapped for the mobile app: your own, or ?username=<name> for someone else's, with the same
// privacy check as /u/<username>/wrapped/<year>.
export async function GET(req: Request, { params }: { params: { year: string } }) {
  const year = parseWrappedYear(params.year);
  if (!year) return NextResponse.json({ error: "There's no Wrapped for that year yet." }, { status: 404 });
  const viewer = await getCurrentUser();
  const username = new URL(req.url).searchParams.get("username");

  let owner: { id: string; username: string | null; displayName?: string | null; favColour: string | null } | null;
  if (username) {
    owner = await getWrappedOwner(username);
    if (!owner) return NextResponse.json({ error: "Wrapped not found" }, { status: 404 });
    if (viewer?.id !== owner.id && !(await canViewUser(viewer?.id, owner.id, "profile"))) {
      return NextResponse.json({ error: "Wrapped not found" }, { status: 404 });
    }
  } else {
    if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    owner = { id: viewer.id, username: viewer.username, displayName: viewer.displayName, favColour: viewer.favColour };
  }

  // Private books are the owner's alone, so anyone else sees the year without them.
  const sharedOnly = viewer?.id !== owner.id;
  const [wrapped, years] = await Promise.all([getWrapped(owner.id, year, null, { sharedOnly }), getWrappedYears(owner.id, { sharedOnly })]);
  return NextResponse.json({ year, wrapped, years, owner: { username: owner.username, displayName: owner.displayName ?? null, accent: owner.favColour ?? null }, own: viewer?.id === owner.id });
}
