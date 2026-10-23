import { ImageResponse } from 'next/og'

// The site-wide share image: just the Bookmark mark (public/logo.svg), centred. Pages with their own card override it.
export const alt = 'Bookmark'
export const size = { width: 600, height: 600 }
export const contentType = 'image/png'

const BRAND = '#F13C3C'
const BG = '#0B0B0C'
const BOOKMARK_PATH = 'M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z'

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG }}>
        <svg width="290" height="300" viewBox="0 0 30 31" fill="none">
          <path d={BOOKMARK_PATH} fill={BRAND} />
        </svg>
      </div>
    ),
    size
  )
}
