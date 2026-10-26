import { MetadataRoute } from 'next'
import prisma from '@/lib/db'
import { GENRES } from '@/lib/genres'
import { publicProfileWhere, sharedBookWhere } from '@/lib/privacy'
import { siteUrl } from '@/lib/siteUrl'
import { bookHref } from '@/lib/workKey'

// Lists users and lists from the database: refresh hourly instead of freezing it at build time.
export const revalidate = 3600


export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/signin`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/register`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Public profiles with at least one visible (started/completed) book are
  // worth indexing; followers-only and private ones are left out. Capped to keep
  // the sitemap a reasonable size.
  // A database hiccup at build time shouldn't fail the deploy: fall back to the
  // static routes and let the hourly revalidation fill the rest in.
  const [usersWithBooks, publicLists, reviewedWorks] = await Promise.all([
    prisma.user.findMany({
      where: {
        AND: [
          { username: { not: null } },
          { books: { some: { status: { in: ['STARTED', 'COMPLETED'] }, ...sharedBookWhere } } },
          publicProfileWhere,
        ],
      },
      select: { username: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    }),
    prisma.list.findMany({
      // A reader's list is only crawlable while their profile is public; Picks are the team's.
      where: { visibility: 'PUBLIC', hidden: false, OR: [{ isPick: true }, { owner: publicProfileWhere }] },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    }),
    // Book pages worth a crawl: books with an Open Library key that at least one reader has reviewed.
    prisma.work.findMany({
      where: { openLibraryKey: { not: null }, books: { some: { review: { not: null }, ...sharedBookWhere } } },
      select: { openLibraryKey: true, title: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    }),
  ]).catch((err) => {
    console.error('sitemap: database unavailable, serving static routes only', err)
    return [[], [], []] as const
  })

  const profileRoutes: MetadataRoute.Sitemap = usersWithBooks.map((u) => ({
    url: `${siteUrl}/u/${u.username}`,
    lastModified: u.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  const discoverRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/discover`, changeFrequency: 'daily', priority: 0.8 },
    ...GENRES.map((g) => ({ url: `${siteUrl}/discover/genre/${g.slug}`, changeFrequency: 'weekly' as const, priority: 0.6 })),
    ...publicLists.map((l) => ({ url: `${siteUrl}/lists/${l.id}`, lastModified: l.updatedAt, changeFrequency: 'weekly' as const, priority: 0.6 })),
  ]

  const bookRoutes: MetadataRoute.Sitemap = reviewedWorks.map((w) => ({
    url: `${siteUrl}${bookHref({ workKey: w.openLibraryKey, title: w.title })}`,
    lastModified: w.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...discoverRoutes, ...bookRoutes, ...profileRoutes]
}
