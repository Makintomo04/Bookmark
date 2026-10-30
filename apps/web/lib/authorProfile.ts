import prisma from "@/lib/db";
import { authorSlug } from "@/lib/authorNames";
import { logStaffAction } from "@/lib/staffLog";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { uploadersOf } from "@/lib/uploads";
import { parseProfileFix, type ProfileValues } from "@/lib/authorProfileRules";

export * from "@/lib/authorProfileRules";

// A librarian's bio and photo for /authors/<slug>, from the Authors tab of the staff catalogue. They win
// over Open Library's (lib/authors.ts authorAbout); clearing one falls back to it.

type Actor = { id: string };

export async function authorProfile(name: string): Promise<ProfileValues> {
  const row = await prisma.authorProfile.findUnique({ where: { slug: authorSlug(name) }, select: { bio: true, photoUrl: true } });
  return { bio: row?.bio ?? null, photoUrl: row?.photoUrl ?? null };
}

export async function saveAuthorProfile(actor: Actor, body: Record<string, unknown>): Promise<StaffOutcome<ProfileValues>> {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = authorSlug(name);
  if (!name || !slug) return staffFail(400, "Which author?");
  const parsed = parseProfileFix(body);
  if (!parsed.ok) return staffFail(400, parsed.error);
  const patch = parsed.patch;
  // The page is public, so never a reader's own upload (lib/uploads.ts).
  if (patch.photoUrl && (await uploadersOf([patch.photoUrl])).size) return staffFail(400, "That photo is a reader's own upload, so it can't go on an author page.");

  const before = await authorProfile(name);
  const next = { ...before, ...patch };
  if (next.bio === before.bio && next.photoUrl === before.photoUrl) return { ok: true, value: before };
  await prisma.authorProfile.upsert({
    where: { slug },
    create: { slug, ...next, updatedById: actor.id },
    update: { ...next, updatedById: actor.id },
  });
  await logStaffAction({
    actorId: actor.id, action: "author.profile", targetType: "author", targetId: slug,
    before: { ...before }, after: { ...next }, reason: typeof body.reason === "string" ? body.reason : null,
  });
  return { ok: true, value: next };
}
