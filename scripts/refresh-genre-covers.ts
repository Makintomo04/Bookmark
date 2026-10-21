// Downloads the covers fanned on the Discover genre tiles into public/genres/<slug>-<n>.jpg.
// They're stored in the app so the tiles render with their covers straight away, rather than waiting
// on Open Library's search and cover servers on every visit.
//
//   node --import ./scripts/test/register.mjs scripts/refresh-genre-covers.ts            # every genre
//   node --import ./scripts/test/register.mjs scripts/refresh-genre-covers.ts fantasy    # just these slugs
//
// Takes the most-shelved books in each genre with a downloadable cover, skipping any already on another
// genre's tile (the big sellers sit in several subjects). A genre that can't get GENRE_TILE_COVERS of
// them is left with its existing files and reported at the end.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { GENRES, GENRE_TILE_COVERS, genreTileCovers } from "../lib/genres.ts";
import { subjectBooks } from "../lib/openLibrary.ts";
import { downloadCover } from "../lib/covers.ts";

const only = process.argv.slice(2);
const genres = only.length ? GENRES.filter((g) => only.includes(g.slug)) : GENRES;
const unknown = only.filter((slug) => !GENRES.some((g) => g.slug === slug));
if (unknown.length) {
  console.error(`Unknown genre: ${unknown.join(", ")}`);
  process.exit(1);
}

async function main() {
  await mkdir("public/genres", { recursive: true });

  // Compared by content: the same image often sits under several Open Library cover ids.
  const hash = (bytes: Uint8Array) => createHash("sha1").update(bytes).digest("hex");
  const used = new Set<string>();
  for (const other of GENRES.filter((g) => !genres.includes(g))) {
    for (const path of genreTileCovers(other.slug)) {
      const bytes = await readFile(`public${path}`).catch(() => null);
      if (bytes) used.add(hash(bytes));
    }
  }

  const failed: string[] = [];
  for (const genre of genres) {
    const books = await subjectBooks(genre.subject, 0, 24).catch(() => []);
    const files: Uint8Array[] = [];
    for (const book of books) {
      if (files.length === GENRE_TILE_COVERS) break;
      if (!book.coverUrl) continue;
      try {
        const file = await downloadCover(book.coverUrl.replace(/-L\.jpg$/, "-M.jpg"));
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (used.has(hash(bytes))) continue;
        used.add(hash(bytes));
        files.push(bytes);
      } catch {
        // No usable cover for this book; try the next one.
      }
    }

    if (files.length < GENRE_TILE_COVERS) {
      console.warn(`${genre.slug}: only found ${files.length} covers, kept the existing ones`);
      failed.push(genre.slug);
      continue;
    }
    await Promise.all(genreTileCovers(genre.slug).map((path, i) => writeFile(`public${path}`, files[i])));
    console.log(`${genre.slug}: saved ${files.length} covers`);
  }

  if (failed.length) {
    console.error(`\nNot updated: ${failed.join(", ")}. Re-run with just those slugs to try again.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
