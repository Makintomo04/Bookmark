/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/shared ships TypeScript source, so Next compiles it like the app's own files.
  transpilePackages: ['@bookmark/shared'],
  // Lets a second dev server use its own build folder (see scripts/dev-isolated.mjs).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'utfs.io' },
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com' },
      { protocol: 'https', hostname: 'images3.penguinrandomhouse.com' },
      { protocol: 'https', hostname: 'images1.penguinrandomhouse.com' },
      { protocol: 'https', hostname: 'covers.openlibrary.org' },
      // Avatars from Google and GitHub sign-ins, kept as the profile picture until the reader changes it.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  // Buddy reads were renamed reading circles: old links (shared invites, notifications, bookmarks) keep working.
  async redirects() {
    return [
      { source: '/buddy-reads', destination: '/circles', permanent: true },
      { source: '/buddy-reads/:path*', destination: '/circles/:path*', permanent: true },
    ];
  },
  async headers() {
    return [
      // Only the embeds (/embed/*) may be framed, by any site. They're also kept out of search results:
      // the page they point back to is the one that should rank.
      {
        source: '/embed/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
      // Everything else: same-origin framing only (clickjacking). X-Frame-Options for older browsers.
      {
        source: '/((?!embed/|embed$).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
