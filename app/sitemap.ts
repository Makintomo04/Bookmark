import { MetadataRoute } from 'next'
import prisma from '@/lib/db'

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

  return [...staticRoutes, ...profileRoutes]
}
