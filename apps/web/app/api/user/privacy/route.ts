import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { GENRES } from "@/lib/genres";
import { preferencesOf, preferencesSelect } from "@/lib/preferences";
import { privacyOf, privacySelect } from "@/lib/privacy";
import { NextResponse } from "next/server";
import { z } from "zod";

// Any subset of the settings; each one saves as soon as it's changed. Privacy and community
// preferences share this route because they're shown together (settings and onboarding).
const bodySchema = z.object({
  profileVisibility: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]),
  reviewVisibility: z.enum(["EVERYONE", "FOLLOWERS", "ONLY_ME"]),
  hideWantToRead: z.boolean(),
  hideFollowCounts: z.boolean(),
  // Only librarians see the control; for anyone else it changes nothing (lib/staffBadge.ts).
  hideStaffBadge: z.boolean(),
  buddyReadInvites: z.enum(["EVERYONE", "FOLLOWING", "NOBODY"]),
  showSpoilers: z.boolean(),
  defaultListVisibility: z.enum(["PRIVATE", "PUBLIC"]),
  aiFeatures: z.boolean(),
  favGenres: z.array(z.string()).max(GENRES.length)
    .refine((slugs) => slugs.every((s) => GENRES.some((g) => g.slug === s)), "Unknown genre")
    .transform((slugs) => Array.from(new Set(slugs))),
  hideShelfPicks: z.boolean(),
}).partial().strict();

type Stored = Parameters<typeof privacyOf>[0] & Parameters<typeof preferencesOf>[0] & { favGenres: string[]; hideShelfPicks: boolean | null };

const settingsOf = (user: Stored) => ({ ...privacyOf(user), ...preferencesOf(user), favGenres: user.favGenres, hideShelfPicks: user.hideShelfPicks ?? false });

export async function GET() {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  return NextResponse.json(settingsOf(currentUser));
}

export async function PATCH(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: currentUser.id },
    data: parsed.data,
    select: { ...privacySelect, ...preferencesSelect, favGenres: true, hideShelfPicks: true },
  });
  return NextResponse.json(settingsOf(user));
}
