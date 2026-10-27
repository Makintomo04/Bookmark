import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bookmark — Your reading and your friends, in one app',
    short_name: 'Bookmark',
    description: "Your reading and your friends, in one app. Free stats, goals and Wrapped, and private reading circles with friends.",
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#F13C3C',
    icons: [
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  }
}
