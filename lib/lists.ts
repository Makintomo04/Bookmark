import { booksReadCount } from "@/lib/readerTier";
import { Prisma } from "@prisma/client"
import prisma from "./db"
import { GENRES } from "./genres"
import { normaliseWorkKey, sameBook } from "./workKey"
import { blockedUserIds, canView, canViewUser, privacyOf, privacySelect, visibleReview, type Relation } from "./privacy"
import type { DiscoverBook } from "./openLibrary"
import { LIST_DESCRIPTION_MAX, LIST_ITEMS_MAX, LIST_NOTE_MAX, LIST_TAGS_MAX, LIST_TITLE_MAX, OWN_LISTS_MAX, type Curator } from "./listRules"

export * from "./listRules"

type Viewer = { id: string, isStaff?: boolean, username?: string | null } | null

const ownerSelect = { username: true, image: true, favColour: true, ...booksReadCount } as const

// What a viewer may see: public, unhidden lists, plus their own. Staff see everything.
const visibleTo = (viewer: Viewer): Prisma.ListWhereInput =>
  viewer?.isStaff ? {} : {
    OR: [
      { visibility: "PUBLIC", hidden: false },
      ...(viewer ? [{ ownerId: viewer.id }] : []),
    ],
  }

export interface ListFilters {
  pick?: boolean
  // Lists made by readers rather than the team. Empty ones are left out so browsing never hits a blank list.
  community?: boolean
  genre?: string
  featured?: boolean
  owner?: string
  // Staff only: lists with at least one report, of any visibility, for review.
  reported?: boolean
  limit?: number
}

const publicOnly: Prisma.ListWhereInput = { visibility: "PUBLIC", hidden: false }

export async function findLists(filters: ListFilters, viewer: Viewer) {
  if (filters.reported && !viewer?.isStaff) return []
  const now = new Date()
  const isOwnProfile = !!filters.owner && viewer?.username === filters.owner
  const where: Prisma.ListWhereInput = {
    AND: [
      // Browsing surfaces only ever show public lists. A profile shows its owner their private ones too.
      filters.reported || isOwnProfile ? {} : publicOnly,
      ...(filters.pick ? [{ isPick: true }] : []),
      ...(filters.community ? [{ isPick: false, items: { some: {} } }] : []),
      ...(filters.genre ? [{ genres: { has: filters.genre } }] : []),
      ...(filters.featured ? [{ featuredFrom: { lte: now }, featuredUntil: { gte: now } }] : []),
      ...(filters.owner ? [{ owner: { username: filters.owner } }] : []),
      ...(filters.reported ? [{ reports: { some: {} } }] : []),
    ],
  }
  const lists = await prisma.list.findMany({
    where,
    orderBy: filters.featured ? { featuredFrom: "desc" } : { updatedAt: "desc" },
    take: Math.min(filters.limit ?? 24, 50),
    include: {
      owner: { select: ownerSelect },
      items: { orderBy: { position: "asc" }, take: 4, select: { title: true, author: true, coverUrl: true } },
      _count: { select: { items: true, reports: true } },
    },
  })
  return lists.map(({ _count, ownerId, ...list }) => ({
    ...list,
    itemCount: _count.items,
    reportCount: viewer?.isStaff ? _count.reports : 0,
  }))
}

// The signed-in reader's own lists, with enough of each item to tell whether a book is already on it.
export async function findMyLists(viewer: { id: string }) {
  return prisma.list.findMany({
    where: { ownerId: viewer.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      visibility: true,
      items: { select: { workKey: true, title: true, author: true } },
    },
  })
}

export type ListSummary = Awaited<ReturnType<typeof findLists>>[number]

export async function findList(id: string, viewer: Viewer) {
  if (!/^[0-9a-f]{24}$/i.test(id)) return null
  const list = await prisma.list.findFirst({
    where: { AND: [{ id }, visibleTo(viewer)] },
    include: {
      owner: { select: { id: true, ...ownerSelect } },
      items: { orderBy: { position: "asc" } },
    },
  })
  if (!list) return null

  const isFollowing = viewer && viewer.id !== list.ownerId
    ? !!(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: list.ownerId } } }))
    : false
  const isOwner = viewer?.id === list.ownerId
  const isCopyable = list.visibility === "PUBLIC" && !list.hidden && !isOwner
  // Remixes keep the original curator's notes; everyone else's notes are the owner's.
  const noteAuthorIds = Array.from(new Set(list.items.flatMap((i) => (i.note && i.noteAuthorId && i.noteAuthorId !== list.ownerId ? [i.noteAuthorId] : []))))
  const [reportCount, hasReported, remixCount, forkedFrom, noteAuthors, canCopy] = await Promise.all([
    viewer?.isStaff ? prisma.listReport.count({ where: { listId: list.id } }) : 0,
    viewer && !isOwner
      ? prisma.listReport.findUnique({ where: { listId_reporterId: { listId: list.id, reporterId: viewer.id } } }).then(Boolean)
      : false,
    prisma.list.count({ where: { forkedFromId: list.id } }),
    list.forkedFromId ? findOrigin(list.forkedFromId, viewer) : null,
    noteAuthorIds.length
      ? prisma.user.findMany({ where: { id: { in: noteAuthorIds } }, select: { id: true, ...ownerSelect } })
      : [],
    // Signed-out readers see the button and get sent to sign up; blocks and private profiles hide it.
    isCopyable && viewer ? canViewUser(viewer.id, list.ownerId) : isCopyable,
  ])
  const { id: ownerId, ...owner } = list.owner
  const authors = new Map<string, Curator>(noteAuthors.map(({ id, ...author }) => [id, author]))
  return {
    ...list,
    items: list.items.map((item) => ({
      ...item,
      // The person behind the note, shown with it as "why you'd like this".
      curator: item.note ? (item.noteAuthorId && authors.get(item.noteAuthorId)) || owner : null,
    })),
    owner,
    ownerId: undefined,
    isOwner,
    canEdit: isOwner || !!viewer?.isStaff,
    canCopy,
    isFollowing,
    reportCount,
    hasReported,
    remixCount,
    forkedFrom,
  }
}

// Where a remix came from. The original's title and curator only show while the viewer could open it.
async function findOrigin(id: string, viewer: Viewer) {
  const origin = await prisma.list.findFirst({
    where: { AND: [{ id }, visibleTo(viewer)] },
    select: { id: true, title: true, owner: { select: { id: true, username: true } } },
  })
  if (!origin || !(await canViewUser(viewer?.id, origin.owner.id))) return { list: null }
  return { list: { id: origin.id, title: origin.title, username: origin.owner.username } }
}

export type ListDetail = NonNullable<Awaited<ReturnType<typeof findList>>>

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

const slugifyTag = (t: string) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)

// A bare yyyy-mm-dd end date means "through the end of that day".
const toDate = (v: unknown, endOfDay = false) => {
  if (!v || typeof v !== "string") return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) && endOfDay ? `${v}T23:59:59.999Z` : v)
  return isNaN(d.getTime()) ? null : d
}

// Turns a request body into list data, or an error message. Staff-only fields are ignored for everyone else.
export function parseListInput(body: any, isStaff: boolean) {
  const title = clean(body?.title, LIST_TITLE_MAX)
  if (!title) return { error: "Give your list a title." } as const

  const rawItems: any[] = Array.isArray(body?.items) ? body.items : []
  if (rawItems.length > LIST_ITEMS_MAX) return { error: `Lists can hold up to ${LIST_ITEMS_MAX} books.` } as const

  const items: Prisma.ListItemCreateManyListInput[] = []
  for (const raw of rawItems) {
    const item = {
      workKey: normaliseWorkKey(raw?.workKey),
      title: clean(raw?.title, 300),
      author: clean(raw?.author, 200) || "Unknown",
      coverUrl: typeof raw?.coverUrl === "string" && raw.coverUrl.startsWith("https://") ? raw.coverUrl : null,
      pages: Number.isInteger(raw?.pages) && raw.pages > 0 ? raw.pages : null,
      note: clean(raw?.note, LIST_NOTE_MAX) || null,
    }
    if (!item.title || items.some((existing) => sameBook(existing, item))) continue
    items.push({ ...item, position: items.length })
  }

  const data = {
    title,
    description: clean(body?.description, LIST_DESCRIPTION_MAX) || null,
    visibility: body?.visibility === "PUBLIC" ? "PUBLIC" as const : "PRIVATE" as const,
    genres: (Array.isArray(body?.genres) ? body.genres : []).filter((g: unknown) => GENRES.some((genre) => genre.slug === g)),
    tags: Array.from(new Set<string>((Array.isArray(body?.tags) ? body.tags : []).map((t: unknown) => slugifyTag(String(t))).filter(Boolean))).slice(0, LIST_TAGS_MAX),
    ...(isStaff ? {
      isPick: !!body?.isPick,
      hidden: !!body?.hidden,
      featuredLabel: clean(body?.featuredLabel, 60) || null,
      featuredFrom: toDate(body?.featuredFrom),
      featuredUntil: toDate(body?.featuredUntil, true),
    } : {}),
  }
  if (data.featuredFrom && data.featuredUntil && data.featuredFrom > data.featuredUntil) {
    return { error: "The spotlight has to end after it starts." } as const
  }
  return { data, items } as const
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "")

// The editor works on plain JSON, so dates travel as yyyy-mm-dd.
export const toEditableList = (list: ListDetail) => ({
  id: list.id,
  title: list.title,
  description: list.description ?? "",
  visibility: list.visibility,
  genres: list.genres,
  tags: list.tags,
  isPick: list.isPick,
  hidden: list.hidden,
  featuredLabel: list.featuredLabel ?? "",
  featuredFrom: day(list.featuredFrom),
  featuredUntil: day(list.featuredUntil),
  items: list.items.map((item) => ({
    workKey: item.workKey,
    title: item.title,
    author: item.author,
    coverUrl: item.coverUrl,
    pages: item.pages,
    note: item.note ?? "",
    // Shown in the editor so a remixer knows whose words they are. The server keeps the attribution
    // only while the note is unchanged.
    noteBy: item.curator && item.curator !== list.owner ? item.curator.username : null,
  })),
})

type StoredItem = { workKey: string | null, title: string, author: string, note: string | null, noteAuthorId: string | null, createdAt: Date }

// Saving replaces a list's items wholesale, so carry over what the editor doesn't send: when each
// book was added (Discover's "recently added") and who wrote its note. A note keeps its original
// author only while its text is unchanged; edit it and it becomes the owner's own.
export function carryOverItems(existing: StoredItem[], items: Prisma.ListItemCreateManyListInput[]) {
  return items.map((item) => {
    const before = existing.find((e) => sameBook(e, { workKey: item.workKey ?? null, title: item.title, author: item.author }))
    if (!before) return item
    const keepsAuthor = !!before.noteAuthorId && !!item.note && before.note === item.note
    return { ...item, createdAt: before.createdAt, noteAuthorId: keepsAuthor ? before.noteAuthorId : null }
  })
}

type CopyResult = { id: string } | { error: string, status: number }

// "Copy to my lists": a private copy of someone else's public list. Notes come along, still
// credited to whoever wrote them, and the copy remembers where it came from.
export async function copyList(id: string, viewer: { id: string, isStaff?: boolean }): Promise<CopyResult> {
  const notFound = { error: "List not found", status: 404 }
  if (!/^[0-9a-f]{24}$/i.test(id)) return notFound
  // Private and hidden lists can't be copied; neither can anything from a reader the viewer can't
  // see (a block either way, or a private profile).
  const original = await prisma.list.findFirst({
    where: { id, ...publicOnly },
    include: { items: { orderBy: { position: "asc" } } },
  })
  if (!original || !(await canViewUser(viewer.id, original.ownerId))) return notFound
  if (original.ownerId === viewer.id) return { error: "This list is already yours.", status: 400 }
  if (!viewer.isStaff && (await prisma.list.count({ where: { ownerId: viewer.id } })) >= OWN_LISTS_MAX) {
    return { error: `You can have up to ${OWN_LISTS_MAX} lists. Delete one to make room.`, status: 400 }
  }

  const copy = await prisma.list.create({
    data: {
      ownerId: viewer.id,
      title: original.title,
      description: original.description,
      visibility: "PRIVATE",
      genres: original.genres,
      tags: original.tags,
      forkedFromId: original.id,
      items: {
        createMany: {
          data: original.items.map((item, position) => ({
            workKey: item.workKey,
            title: item.title,
            author: item.author,
            coverUrl: item.coverUrl,
            pages: item.pages,
            note: item.note,
            noteAuthorId: item.note ? item.noteAuthorId ?? original.ownerId : null,
            position,
          })),
        },
      },
    },
  })
  return { id: copy.id }
}

// ---------------------------------------------------------------------------------------------
// Recommendations from people the reader follows. Every one is a person's pick (a list they made
// or a book they rated highly), shown with their reason. Nothing is ranked beyond "most recent".

// Follows beyond this are ignored (newest kept), so following thousands still means bounded queries.
const FOLLOWED_MAX = 500
// Public lists by followed readers considered, most recently updated first.
const FOLLOWED_LISTS_MAX = 300
const REVIEW_SNIPPET_MAX = 240

// Everyone here is followed by the viewer, so they relate as a follower.
const FOLLOWER: Relation = { isSelf: false, isFollower: true, blocked: null }

type FollowedPerson = Curator & { privacy: ReturnType<typeof privacyOf> }

// The people the viewer follows whose profile they may see, minus blocks either way.
export async function followedPeople(viewerId: string) {
  const [follows, blocked] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: viewerId },
      orderBy: { createdAt: "desc" },
      take: FOLLOWED_MAX,
      select: { followingId: true },
    }),
    blockedUserIds(viewerId),
  ])
  const blockedIds = new Set(blocked)
  const ids = follows.map((f) => f.followingId).filter((id) => !blockedIds.has(id))
  const people = new Map<string, FollowedPerson>()
  if (ids.length === 0) return { followsAnyone: follows.length > 0, people }

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, ...ownerSelect, ...privacySelect },
  })
  for (const { id, username, image, favColour, _count, ...stored } of users) {
    const privacy = privacyOf(stored)
    if (canView(FOLLOWER, privacy, "profile")) people.set(id, { username, image, favColour, _count, privacy })
  }
  return { followsAnyone: true, people }
}

export const publicPerson = ({ privacy, ...person }: FollowedPerson): Curator => person

// A review as a reason: only when the viewer may read it, and never a spoiler.
function reviewSnippet(book: { review: string | null, reviewSpoiler: boolean | null, reviewPrivate: boolean | null }, person: FollowedPerson) {
  const shown = visibleReview(book, FOLLOWER, person.privacy)
  if (!shown.review || shown.reviewSpoiler) return null
  const text = shown.review.trim().replace(/\s+/g, " ")
  return text.length > REVIEW_SNIPPET_MAX ? `${text.slice(0, REVIEW_SNIPPET_MAX - 1).trimEnd()}…` : text
}

function followedPublicLists(ownerIds: string[]) {
  return prisma.list.findMany({
    where: { ownerId: { in: ownerIds }, ...publicOnly },
    orderBy: { updatedAt: "desc" },
    take: FOLLOWED_LISTS_MAX,
    select: { id: true, title: true, ownerId: true },
  })
}

export interface PersonPick {
  person: Curator
  // Their reason: a list note, or a snippet of their review.
  reason: string | null
  rating: number | null
  list: { id: string, title: string } | null
}

// Book details: the people the viewer follows who put this book on a public list or rated it 4+.
export async function peoplePicksForBook(viewerId: string, book: { workKey: string | null, title: string, author: string }) {
  const { followsAnyone, people } = await followedPeople(viewerId)
  if (people.size === 0) return { followsAnyone, picks: [] as PersonPick[] }
  const ids = Array.from(people.keys())
  // The work key is indexed on both collections. Books without one fall back to an exact title,
  // narrowed by the followed readers' own lists and shelves, then checked with sameBook.
  const match = book.workKey ? { workKey: book.workKey } : { title: book.title }

  const lists = await followedPublicLists(ids)
  const listsById = new Map(lists.map((l) => [l.id, l]))
  const [items, shelved] = await Promise.all([
    lists.length
      ? prisma.listItem.findMany({
          where: { ...match, listId: { in: lists.map((l) => l.id) } },
          take: 100,
          select: { listId: true, workKey: true, title: true, author: true, note: true },
        })
      : [],
    prisma.book.findMany({
      where: { ...match, userId: { in: ids }, rating: { gte: 4 } },
      take: 100,
      select: { userId: true, workKey: true, title: true, author: true, rating: true, review: true, reviewSpoiler: true, reviewPrivate: true },
    }),
  ])

  const byPerson = new Map<string, PersonPick>()
  for (const item of items) {
    const list = listsById.get(item.listId)
    if (!list || !sameBook(item, book)) continue
    if (byPerson.get(list.ownerId)?.reason) continue
    byPerson.set(list.ownerId, {
      person: publicPerson(people.get(list.ownerId)!),
      reason: item.note || null,
      rating: null,
      list: { id: list.id, title: list.title },
    })
  }
  for (const shelf of shelved) {
    const person = people.get(shelf.userId)
    if (!person || !sameBook(shelf, book)) continue
    const current = byPerson.get(shelf.userId)
    byPerson.set(shelf.userId, {
      person: publicPerson(person),
      reason: current?.reason || reviewSnippet(shelf, person),
      rating: shelf.rating,
      list: current?.list ?? null,
    })
  }

  // People who gave a reason come first: the reason is the point.
  const picks = Array.from(byPerson.values()).sort((a, b) => Number(!!b.reason) - Number(!!a.reason))
  return { followsAnyone, picks }
}

export interface FollowingPick {
  key: string
  book: DiscoverBook
  person: Curator
  reason: string | null
  rating: number | null
  list: { id: string, title: string } | null
  at: Date
}

const FOLLOWING_PICKS_MAX = 12

// Discover: what the people the viewer follows recently added to their public lists or rated 4+.
export async function followingPicks(viewerId: string) {
  const { followsAnyone, people } = await followedPeople(viewerId)
  if (people.size === 0) return { followsAnyone, picks: [] as FollowingPick[] }
  const ids = Array.from(people.keys())

  const lists = await followedPublicLists(ids)
  const listsById = new Map(lists.map((l) => [l.id, l]))
  const [items, rated] = await Promise.all([
    lists.length
      ? prisma.listItem.findMany({
          where: { listId: { in: lists.map((l) => l.id) } },
          orderBy: { createdAt: "desc" },
          take: 40,
        })
      : [],
    prisma.book.findMany({
      where: { userId: { in: ids }, status: "COMPLETED", rating: { gte: 4 } },
      orderBy: { completedAt: "desc" },
      take: 40,
      select: { id: true, userId: true, workKey: true, title: true, author: true, coverImage: true, pages: true, rating: true, review: true, reviewSpoiler: true, reviewPrivate: true, completedAt: true, createdAt: true },
    }),
  ])

  const candidates: FollowingPick[] = []
  for (const item of items) {
    const list = listsById.get(item.listId)
    const person = list && people.get(list.ownerId)
    if (!list || !person) continue
    candidates.push({
      key: `item-${item.id}`,
      book: { workKey: item.workKey, title: item.title, author: item.author, coverUrl: item.coverUrl, pages: item.pages },
      person: publicPerson(person),
      reason: item.note || null,
      rating: null,
      list: { id: list.id, title: list.title },
      at: item.createdAt,
    })
  }
  for (const book of rated) {
    const person = people.get(book.userId)
    if (!person) continue
    candidates.push({
      key: `book-${book.id}`,
      book: { workKey: book.workKey, title: book.title, author: book.author, coverUrl: book.coverImage || null, pages: book.pages || null },
      person: publicPerson(person),
      reason: reviewSnippet(book, person),
      rating: book.rating,
      list: null,
      at: book.completedAt ?? book.createdAt,
    })
  }

  // Newest first, one card per book. For the same book, a pick with a reason beats one without.
  candidates.sort((a, b) => b.at.getTime() - a.at.getTime())
  const picks: FollowingPick[] = []
  for (const pick of candidates) {
    const same = picks.findIndex((p) => sameBook(p.book, pick.book))
    if (same === -1) {
      if (picks.length < FOLLOWING_PICKS_MAX) picks.push(pick)
    } else if (!picks[same].reason && pick.reason) {
      picks[same] = pick
    }
  }
  return { followsAnyone, picks }
}

