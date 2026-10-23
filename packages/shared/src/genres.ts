import { shade } from "./colour"

// `subject` is the Open Library subject key behind each genre page (see subjectBooks in lib/openLibrary.ts).
export interface Genre {
  slug: string
  label: string
  subject: string
  colour: string
}

export const GENRES: Genre[] = [
  { slug: "fantasy", label: "Fantasy", subject: "fantasy", colour: "#5F3DC4" },
  { slug: "sci-fi", label: "Sci-Fi", subject: "science_fiction", colour: "#1864AB" },
  { slug: "romance", label: "Romance", subject: "romance", colour: "#C2255C" },
  { slug: "mystery-thriller", label: "Mystery & Thriller", subject: "mystery_and_detective_stories", colour: "#343A40" },
  { slug: "horror", label: "Horror", subject: "horror", colour: "#8A1C1C" },
  { slug: "historical-fiction", label: "Historical Fiction", subject: "historical_fiction", colour: "#9C4221" },
  { slug: "literary-fiction", label: "Literary Fiction", subject: "literary_fiction", colour: "#2B6E3A" },
  { slug: "young-adult", label: "Young Adult", subject: "young_adult_fiction", colour: "#C2410C" },
  { slug: "classics", label: "Classics", subject: "classic_literature", colour: "#5C4033" },
  { slug: "biography-memoir", label: "Biography & Memoir", subject: "biography", colour: "#0B7285" },
  { slug: "self-help", label: "Self-Help", subject: "self-help", colour: "#8A6A00" },
  { slug: "history", label: "History", subject: "history", colour: "#6B5B3E" },
  { slug: "poetry", label: "Poetry", subject: "poetry", colour: "#862E9C" },
  { slug: "graphic-novels", label: "Graphic Novels", subject: "graphic_novels", colour: "#B4350B" },
]

export const genreBySlug = (slug: string) => GENRES.find((g) => g.slug === slug)

// The covers fanned on each Discover tile live in public/genres, so the tiles don't wait on Open Library.
// Refresh them with scripts/refresh-genre-covers.ts.
export const GENRE_TILE_COVERS = 3
export const genreTileCovers = (slug: string) =>
  Array.from({ length: GENRE_TILE_COVERS }, (_, i) => `/genres/${slug}-${i + 1}.jpg`)

// A soft highlight in the top-right corner over a diagonal fade to a deeper shade of the genre colour.
// Shared by the Discover tiles and the genre page header.
export const genreBackground = (colour: string) =>
  `radial-gradient(circle at 85% 15%, rgb(255 255 255 / 0.18), transparent 55%), linear-gradient(135deg, ${colour}, ${shade(colour, -0.35)})`
