"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Feather, Fingerprint, Ghost, Heart, Hourglass, Landmark, LucideIcon, MessageSquareQuote,
  PenTool, Rocket, Scroll, Sparkles, Sprout, UserRound, Wand2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { readableInk } from '@/lib/colour'
import { genreBackground, type Genre } from '@/lib/genres'

// Lives here rather than in lib/genres.ts, which the server also imports and should stay React-free.
const GENRE_ICONS: Record<string, LucideIcon> = {
  "fantasy": Wand2,
  "sci-fi": Rocket,
  "romance": Heart,
  "mystery-thriller": Fingerprint,
  "horror": Ghost,
  "historical-fiction": Hourglass,
  "literary-fiction": Feather,
  "young-adult": Sparkles,
  "classics": Landmark,
  "biography-memoir": UserRound,
  "self-help": Sprout,
  "history": Scroll,
  "poetry": PenTool,
  "graphic-novels": MessageSquareQuote,
}

type ArtSize = "tile" | "hero"

// Rotation and offset for each cover, fanned down from the top-right corner so the label's
// bottom-left corner stays clear. On hover they spread and drop into view a little further.
const FAN: Record<ArtSize, { cover: string, slots: string[] }> = {
  tile: {
    cover: "-top-1 w-10 sm:w-11",
    slots: [
      "right-[3.25rem] -rotate-[14deg] -translate-y-2 group-hover:right-[3.75rem] group-hover:-rotate-[20deg] group-hover:translate-y-0",
      "right-7 -rotate-2 -translate-y-3 group-hover:rotate-0 group-hover:-translate-y-1",
      "right-1.5 rotate-[12deg] -translate-y-2 group-hover:right-0.5 group-hover:rotate-[18deg] group-hover:translate-y-0",
    ],
  },
  hero: {
    cover: "-top-2 w-16 sm:w-24",
    slots: [
      "right-[6.5rem] sm:right-[10rem] -rotate-[14deg] -translate-y-3",
      "right-14 sm:right-[5.5rem] -rotate-2 -translate-y-5",
      "right-3 sm:right-4 rotate-[12deg] -translate-y-3",
    ],
  },
}

const ICON_SIZE: Record<ArtSize, string> = {
  tile: "-right-3 -bottom-4 size-20 sm:size-24",
  hero: "right-2 -bottom-6 size-28 sm:size-36",
}

// The genre's covers fanned in the corner, or its icon when there aren't at least two to show.
// Covers come from Open Library, which is sometimes down, so any that fail to load are dropped.
export const GenreArt: FC<{ genre: Genre, covers?: string[], size?: ArtSize }> = ({ genre, covers = [], size = "tile" }) => {
  const [failed, setFailed] = useState<string[]>([])
  const shown = covers.filter((url) => !failed.includes(url)).slice(0, 3)
  const Icon = GENRE_ICONS[genre.slug] ?? Sparkles

  return (
    <>
      {shown.length >= 2 ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {shown.map((url, i) => (
            <div
              key={url}
              className={cn(
                "absolute aspect-[2/3] overflow-hidden rounded-[4px] bg-black/20 shadow-lg ring-1 ring-black/10 motion-safe:transition-all motion-safe:duration-300",
                FAN[size].cover, FAN[size].slots[i]
              )}
              style={{ zIndex: i === 1 ? 2 : 1, transitionDelay: `${i * 25}ms` }}
            >
              <Image src={url} alt="" fill sizes={size === "hero" ? "96px" : "44px"} unoptimized className="object-cover" />
            </div>
          ))}
        </div>
      ) : (
        <Icon
          aria-hidden
          strokeWidth={1.5}
          className={cn(
            "pointer-events-none absolute opacity-25 -rotate-12 motion-safe:transition motion-safe:duration-300 group-hover:rotate-0 group-hover:scale-110 group-hover:opacity-35",
            ICON_SIZE[size]
          )}
        />
      )}
      {/* Loads each cover invisibly so a failed one is dropped rather than shown as a broken tile. */}
      {covers.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt="" hidden onError={() => setFailed((f) => [...f, url])} />
      ))}
    </>
  )
}

interface GenreTileProps {
  genre: Genre
  covers?: string[]
  className?: string
}

const GenreTile: FC<GenreTileProps> = ({ genre, covers, className }) => (
  <Link
    href={`/discover/genre/${genre.slug}`}
    style={{ background: genreBackground(genre.colour), color: readableInk(genre.colour) }}
    className={cn(
      "group relative flex h-24 sm:h-28 items-end overflow-hidden rounded-xl p-3 sm:p-4 font-semibold leading-tight shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
  >
    <GenreArt genre={genre} covers={covers} />
    <span className="relative z-10 drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]">{genre.label}</span>
  </Link>
)

export default GenreTile
