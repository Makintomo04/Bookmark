import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { applyAuthorChange, authorWorks, previewAuthorChange, recentAuthorChanges, searchAuthors } from "@/lib/catalogueAuthors";
import { authorProfile, saveAuthorProfile } from "@/lib/authorProfile";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

// /staff/catalogue/authors. ?q= finds names on catalogue books; ?name= lists one name's books; ?recent=1
// is the last ten renames, merges and undos.
export async function GET(req: Request) {
  const { response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const params = new URL(req.url).searchParams;
  if (params.get("recent")) return NextResponse.json(await recentAuthorChanges());
  const profile = params.get("profile");
  if (profile !== null) return NextResponse.json(await authorProfile(profile));
  const name = params.get("name");
  if (name !== null) return NextResponse.json(await authorWorks(name));
  return NextResponse.json(await searchAuthors(params.get("q") ?? ""));
}

// Body: { kind: "rename", from, to } or { kind: "merge", names, keys, to, key }, with { confirm: true,
// reason } to make the change (the reason is required). Without confirm it only counts what would change.
export async function POST(req: Request) {
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const body = await jsonBody(req);
  // { kind: "profile", name, bio?, photoUrl?, reason? } saves the bio and photo the author page shows.
  if (body.kind === "profile") return staffAnswer(await saveAuthorProfile(user, body));
  if (body.confirm !== true) return staffAnswer(await previewAuthorChange(body));
  return staffAnswer(await applyAuthorChange(user, body));
}
