import { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/siteUrl'


export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/u/', '/discover', '/lists/', '/authors/', '/books/', '/signin', '/register'],
      disallow: ['/api/', '/new-user', '/favourites', '/reset-password', '/forgot-password', '/verify-email'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
