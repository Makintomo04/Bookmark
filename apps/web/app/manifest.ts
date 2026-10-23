import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bookmark — Your reading and your friends, in one app',
    short_name: 'Bookmark',
    description: "Track every book with free stats, goals and Wrapped, and read with friends in reading circles where nobody gets spoiled.",
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
