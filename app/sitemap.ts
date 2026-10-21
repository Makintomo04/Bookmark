import { MetadataRoute } from 'next'
import prisma from '@/lib/db'
import { GENRES } from '@/lib/genres'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/signin`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/register`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Public profiles with at least one visible (started/completed) book are
  // worth indexing. Capped to keep the sitemap a reasonable size.
  const usersWithBooks = await prisma.user.findMany({
    where: {
      username: { not: null },
      books: { some: { status: { in: ['STARTED', 'COMPLETED'] } } },
    },
    select: { username: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 1000,
  })

  const profileRoutes: MetadataRoute.Sitemap = usersWithBooks.map((u) => ({
    url: `${siteUrl}/u/${u.username}`,
    lastModified: u.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  const publicLists = await prisma.list.findMany({
    where: { visibility: 'PUBLIC', hidden: false },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 1000,
  })

  const discoverRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/discover`, changeFrequency: 'daily', priority: 0.8 },
    ...GENRES.map((g) => ({ url: `${siteUrl}/discover/genre/${g.slug}`, changeFrequency: 'weekly' as const, priority: 0.6 })),
    ...publicLists.map((l) => ({ url: `${siteUrl}/lists/${l.id}`, lastModified: l.updatedAt, changeFrequency: 'weekly' as const, priority: 0.6 })),
  ]

  return [...staticRoutes, ...discoverRoutes, ...profileRoutes]
}
