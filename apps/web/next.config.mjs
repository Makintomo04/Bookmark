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
      // Covers on books found through Hardcover, the search fallback (lib/hardcover.ts).
      { protocol: 'https', hostname: 'assets.hardcover.app' },
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
      // `next dev` only: lets the mobile app's web build (`expo start --web`, port 8081) call the API from
      // the browser. The phone apps don't need CORS, so production sends none.
      ...(process.env.NODE_ENV === 'development'
        ? [{
            source: '/api/:path*',
            headers: [
              { key: 'Access-Control-Allow-Origin', value: process.env.MOBILE_WEB_ORIGIN || 'http://localhost:8081' },
              { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, PUT, DELETE, OPTIONS' },
              { key: 'Access-Control-Allow-Headers', value: 'authorization, content-type, x-time-zone, x-client' },
            ],
          }]
        : []),
      // Same-origin framing only (clickjacking). X-Frame-Options for older browsers.
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
