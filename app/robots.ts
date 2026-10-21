import { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/u/', '/discover', '/lists/', '/signin', '/register'],
      disallow: ['/api/', '/new-user', '/favourites', '/reset-password', '/forgot-password'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
