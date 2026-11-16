// Book clubs (BOO-49): the rules shared by the API and the apps. A club outlives any one book: it has a name,
// members and one invite link, and each book it reads is a reading circle the club's members are added to
// when it's started. Everything inside a circle (the spoiler lock above all) stays in buddyReads.ts and
// works the same in a club. No database or "@/" imports here, so the rules can be checked under plain Node.
import { z } from "zod";
import { type HostingAllowance, type HostingPlan } from "./buddyReads";
import { BIG_CLUB_MAX_MEMBERS, CLUB_MEMBER_LIMIT, type Entitlements } from "./entitlements";

// A club hosted on a free account holds as many readers as a reading circle; a Plus host's club up to
// BIG_CLUB_MAX_MEMBERS (BOO-79). The limit is the host's entitlement (entitlements.ts clubMemberLimit, with
// FEATURE_COPY.bigClubs for the prompt): gate hosts, not guests, so members never pay. The club's books take the
// club's size, whatever a circle on its own holds.
export const CLUB_MAX_MEMBERS = CLUB_MEMBER_LIMIT.free
export { BIG_CLUB_MAX_MEMBERS }
// The cap follows the host's plan now. A club that grew under Plus keeps everyone if the host drops it (or
// hands the club to a free host); it just takes nobody new until it's back under the free size.
export const clubMemberCap = (host: Pick<Entitlements, "clubMemberLimit">) => host.clubMemberLimit
export const clubFullMessage = (cap: number) => `This club is full (${cap} readers).`
// The club page's Invite readers when nobody new can join: at the cap, or past it after the host's plan
// changed, where "full (15 readers)" beside "40 members" read wrong.
export const clubFullNote = (members: number, cap: number) =>
  members > cap
    ? `No one new can join: the club has ${members} members, more than the ${cap} it can take now. Everyone in it stays.`
    : `The club is full (${cap} readers).`
// What archiving does, for the host's "Archive this club?" confirmation. `voteOn`: a vote or a tie is
// waiting, which archiving calls off.
export const archiveClubNote = (voteOn: boolean) =>
  `Its invite link stops working, no new books can be started, and the books it's reading are marked finished. Their discussions stay open.${voteOn ? " The vote on the next book is cancelled." : ""}`
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

// Muting (BOO-79) follows the same rule as removing: a muted member still reads and votes, but can't comment
// in the club's books or nominate.
export const canMuteInClub = canRemoveFromClub
export const CLUB_MUTED_MESSAGE = "A host has muted you in this club, so you can't comment or nominate for now. You can still read along and vote."

// Only the host names co-hosts, and renames or archives the club.
export const canEditClubSettings = (role: ClubRole | null | undefined) => role === "host"

// An archived club's host and co-hosts keep moderating its finished books (apps/web/lib/buddyReadsServer.ts
// canModerate), so the host can still change who that is without reopening the club: they can take co-host
// away and remove anyone. Nobody is made a co-host, and co-hosts remove no one, until it's reopened.
export function canRemoveFromClubNow(actor: ClubRole, target: ClubRole, active: boolean) {
  return (active || actor === "host") && canRemoveFromClub(actor, target)
}
export function canSetCoHost(actor: ClubRole | null | undefined, coHost: boolean, active: boolean) {
  return canEditClubSettings(actor) && (active || !coHost)
}
// Muting follows removing here too: a mute still holds in an archived club's open discussions, so its host
// can lift it (or mute someone) without reopening the club. Co-hosts wait until it's reopened.
export const canMuteInClubNow = canRemoveFromClubNow

// Removing a reader from one of the club's books follows the club's roles, whoever started the book: a co-host
// can't remove the club's host or another co-host from it (and so lock them out of it). Nobody removes the
// book's own host. Someone no longer in the club counts as a member. `actor` is null when they've left the
// club, which leaves them nobody to remove. Once the club is archived only its host removes anyone
// (canRemoveFromClubNow), whoever started the book.
export function canRemoveFromClubBook(actor: ClubRole | null, target: ClubRole | null, targetHostsBook: boolean, active: boolean = true) {
  if (targetHostsBook || !actor) return false
  return canRemoveFromClubNow(actor, target ?? "member", active)
}

// What "Reading now" says with nothing open. An archived club starts nothing until its host reopens it, so it
// doesn't promise a next book: the host is told how, everyone else that its past reads are still there.
export function clubReadingEmpty(c: { archived: boolean; isHost: boolean; canManage: boolean; upcoming: number }): string {
  if (c.archived) return c.isHost ? "The club is archived. Reopen it to start the next book." : "The club is archived, so there's nothing on the go. Its past reads and their discussions are still here.";
  if (c.upcoming > 0) return "Nothing yet: the next book starts soon.";
  return c.canManage ? "No book yet. Start one, and everyone in the club is added to it." : "No book yet. The host will start one soon.";
}

// ---- Joining ------------------------------------------------------------------------------

// How many readers one of the club's books takes: the host's cap, or the club's size if that's larger. A
// host who drops Plus keeps a club over the free cap (nobody new joins it), and everyone in it still fits in
// each new book, as #148 promised.
export const clubBookCap = (cap: number, clubSize: number) => Math.max(cap, clubSize)

// Who a new club book takes in, in joining order: members not skipped (blocked by its host, removed from
// it) and not in it already, up to `cap` (clubBookCap).
export function clubBookAdditions(memberIds: string[], opts: { skip: Set<string>, already: string[], cap: number }) {
  const inIt = new Set(opts.already)
  return memberIds.filter((id) => !opts.skip.has(id) && !inIt.has(id)).slice(0, Math.max(0, opts.cap - inIt.size))
}

// What the starter is told when a new book couldn't take everyone (only if the club grew while it started).
export function clubBookLeftOutMessage(leftOut: number) {
  return leftOut === 1
    ? "One member couldn't be added to this book. They can join it from the club's page."
    : `${leftOut} members couldn't be added to this book. They can join it from the club's page.`
}

// The club never says you're reading something you haven't started. A copy it puts on your shelf, when a book
// starts or ahead of it, and whether you joined just now or were added, goes in Want to read; your first logged
// page moves it to Currently reading. A copy already on your shelf is left as you have it (even "will not read").
export const CLUB_COPY_STATUS = "NOT_STARTED" as const

// Joins are counted after they're written, so two at the same moment can't both squeeze past the cap: the
// members in joining order, and whether this one is among the first `cap`. A later one backs out.
export function admittedWithinCap(joinOrder: string[], userId: string, cap: number = CLUB_MAX_MEMBERS) {
  const at = joinOrder.indexOf(userId)
  return at >= 0 && at < cap
}

// Who the public invite shows, to anyone with the link, signed out included: members with a public profile
// who haven't blocked the viewer (or been blocked by them), and who aren't suspended. Everyone counts towards
// "N others".
export type InviteMember = { userId: string, profileVisibility?: string | null, suspended?: boolean }
export function inviteFaces<T extends InviteMember>(members: T[], opts: { hostId: string, viewerId?: string | null, blocked: Set<string> }) {
  return members.filter((m) => {
    if (m.userId === opts.viewerId) return true
    if (opts.blocked.has(m.userId) || m.suspended) return false
    return (m.profileVisibility ?? "PUBLIC") === "PUBLIC"
  })
}

// The host an invite names ("<host> invited you"), on the same terms as the faces: never while suspended or
// blocked either way, and not a private profile, since members forward the link beyond anyone the host chose.
// `hostId` is the club's host for a club's book, not whoever started it (a co-host, perhaps private). Null
// names nobody, and the invite says "A reader".
export function inviteHost<T extends InviteMember>(members: T[], hostId: string | null, opts: { viewerId?: string | null, blocked: Set<string> }): T | null {
  const row = hostId ? members.find((m) => m.userId === hostId) : undefined
  return row && inviteFaces([row], { hostId: row.userId, ...opts }).length > 0 ? row : null
}

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

// ---- Big clubs: the members list --------------------------------------------------------------

// The club page lists this many members before "Show all", and offers a search once there are more.
export const MEMBERS_SHOWN = 20

// The members list filter: name or @username, case- and accent-insensitive, so "zoe" finds "Zoë".
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
export function matchesMember(m: { username?: string | null, displayName?: string | null }, query: string) {
  const q = fold(query.trim().replace(/^@/, ""))
  if (!q) return true
  return [m.username, m.displayName].some((s) => !!s && fold(s).includes(q))
}
