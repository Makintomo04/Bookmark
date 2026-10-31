// Book clubs (BOO-49): the rules shared by the API and the apps. A club outlives any one book: it has a name,
// members and one invite link, and each book it reads is a reading circle the club's members are added to
// when it's started. Everything inside a circle (the spoiler lock above all) stays in buddyReads.ts and
// works the same in a club. No database or "@/" imports here, so the rules can be checked under plain Node.
import { z } from "zod";
import { BUDDY_READ_MAX_MEMBERS, type HostingAllowance, type HostingPlan } from "./buddyReads";

// Everyone in the club is added to each book's circle, so a club can't outgrow a circle.
export const CLUB_MAX_MEMBERS = BUDDY_READ_MAX_MEMBERS
export const CLUB_NAME_MAX = 60
export const CLUB_ABOUT_MAX = 300
// Open circles at once: the book the club is reading and the one after it. Club circles don't count against
// the host's own circle limit, so this keeps a club from being a way round it.
export const CLUB_OPEN_CIRCLES_MAX = 2

// ---- Hosting ------------------------------------------------------------------------------

// Gate hosts, not guests: joining a club is never limited. A free account runs one active club, and Plus
// lifts the limit (lib/entitlements.ts canHostUnlimited), as with circles.
// The free limit is promised publicly never to go down; raise it, never lower it.
export const ACTIVE_CLUB_LIMIT: Record<HostingPlan, number> = { free: 1, plus: Infinity }

export function clubAllowance(activeHosted: number, plan: HostingPlan = "free"): HostingAllowance {
  const limit = ACTIVE_CLUB_LIMIT[plan]
  const allowed = activeHosted < limit
  return {
    allowed,
    active: activeHosted,
    limit: Number.isFinite(limit) ? limit : null,
    plan,
    upgrade: !allowed && plan === "free",
    message: allowed ? null
      : limit === 1
        ? "You're already hosting a club. Archive it to start another. Joining clubs is never limited."
        : `You're already hosting ${limit} clubs. Archive one to start another. Joining clubs is never limited.`,
  }
}

// May the club start another book? It counts its open (active) circles: one being read, one coming up.
export function circleSlotsLeft(openCircles: number) {
  return Math.max(0, CLUB_OPEN_CIRCLES_MAX - openCircles)
}
export const CIRCLE_SLOTS_MESSAGE = "This club already has a book on and one coming up. Mark one as finished to start another."

// ---- Roles --------------------------------------------------------------------------------

export type ClubRole = "host" | "cohost" | "member"

export function clubRole(member: { userId: string, coHost?: boolean | null }, hostId: string): ClubRole {
  if (member.userId === hostId) return "host"
  return member.coHost ? "cohost" : "member"
}

// Starting the next book, editing a club circle's schedule, inviting, resetting the link and removing members.
export const canManageClub = (role: ClubRole | null | undefined) => role === "host" || role === "cohost"

// The host can remove anyone else; a co-host only members (never the host or another co-host).
export function canRemoveFromClub(actor: ClubRole, target: ClubRole) {
  if (target === "host") return false
  if (actor === "host") return true
  return actor === "cohost" && target === "member"
}

// Only the host names co-hosts, and renames or archives the club.
export const canEditClubSettings = (role: ClubRole | null | undefined) => role === "host"

// ---- The club's books ---------------------------------------------------------------------

export type ClubCircleLike = { id: string, status: "ACTIVE" | "FINISHED" | "ARCHIVED", startsAt: Date | string }

// The club page: what it's reading (started, newest first), what's next (not started yet, soonest first)
// and what it's read (finished or archived, most recent first).
export function clubShelf<T extends ClubCircleLike>(circles: T[], now: Date = new Date()) {
  const time = (c: T) => new Date(c.startsAt).getTime()
  const open = circles.filter((c) => c.status === "ACTIVE")
  return {
    reading: open.filter((c) => time(c) <= now.getTime()).sort((a, b) => time(b) - time(a)),
    upcoming: open.filter((c) => time(c) > now.getTime()).sort((a, b) => time(a) - time(b)),
    past: circles.filter((c) => c.status !== "ACTIVE").sort((a, b) => time(b) - time(a)),
  }
}

// ---- Input --------------------------------------------------------------------------------

// Left out, it's unchanged; empty or null clears it (clubAbout).
const about = z.string().trim().max(CLUB_ABOUT_MAX, `Keep it to ${CLUB_ABOUT_MAX} characters`).optional().nullable()
export const clubAbout = (about: string | null | undefined) => about || null
const name = z.string().trim().min(1, "Give the club a name").max(CLUB_NAME_MAX, `Club names can be up to ${CLUB_NAME_MAX} characters`)

export const createClubSchema = z.object({ name, about })

export const updateClubSchema = z.object({
  name: name.optional(),
  about,
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
})

export const clubMemberUpdateSchema = z.object({ coHost: z.boolean() })
