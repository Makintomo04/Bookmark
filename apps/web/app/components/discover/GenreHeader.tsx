import { FC } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { GenreArt } from './GenreTile'
import { genreBackground, type Genre } from '@/lib/genres'
import { readableInk } from '@/lib/colour'

// The genre page's back link and header: the Discover tile scaled up, with the same stored covers,
// so it can draw the moment the tile is clicked (the loading state uses it too).
const GenreHeader: FC<{ genre: Genre }> = ({ genre }) => (
  <div>
    <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft size={16} aria-hidden />Discover
    </Link>
    <div className="group relative mt-3 flex h-32 sm:h-40 items-end overflow-hidden rounded-2xl p-6 sm:p-8" style={{ background: genreBackground(genre.colour), color: readableInk(genre.colour) }}>
      <GenreArt genre={genre} size="hero" />
      <h1 className="page-title relative z-10 drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]">{genre.label}</h1>
    </div>
  </div>
)

export default GenreHeader
