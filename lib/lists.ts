import { booksReadCount } from "@/lib/readerTier";
import { Prisma } from "@prisma/client"
import prisma from "./db"
import { GENRES } from "./genres"
import { normaliseWorkKey, sameBook } from "./workKey"
import { LIST_DESCRIPTION_MAX, LIST_ITEMS_MAX, LIST_NOTE_MAX, LIST_TAGS_MAX, LIST_TITLE_MAX } from "./listRules"

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
  const [reportCount, hasReported] = await Promise.all([
    viewer?.isStaff ? prisma.listReport.count({ where: { listId: list.id } }) : 0,
    viewer && viewer.id !== list.ownerId
      ? prisma.listReport.findUnique({ where: { listId_reporterId: { listId: list.id, reporterId: viewer.id } } }).then(Boolean)
      : false,
  ])
  const { id: ownerId, ...owner } = list.owner
  return {
    ...list,
    owner,
    ownerId: undefined,
    isOwner: viewer?.id === ownerId,
    canEdit: viewer?.id === ownerId || !!viewer?.isStaff,
    isFollowing,
    reportCount,
    hasReported,
  }
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
  })),
})

