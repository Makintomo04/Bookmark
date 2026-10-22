import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bookmark — Read with friends, spoiler-free',
    short_name: 'Bookmark',
    description: "Start a reading circle, share one link, and talk about the book as you go. Comments stay hidden until you've read that far.",
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
