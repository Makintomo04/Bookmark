# Should uploaded covers stay private?

**Proposal:** a cover a reader uploads stays on their own copy of the book. Everywhere other readers see a
cover (search, the catalogue, reading circles, recommendations, lists), Bookmark uses only catalogue
covers: Open Library's, or our stored copy of one.

## How an uploaded cover spreads today

A reader can upload a cover when adding a book or editing its details (web and app). The file goes to
UploadThing and its URL is saved on their `Book.coverImage`. From there it travels by copying the URL:

| Door | Code | What happens |
| --- | --- | --- |
| Book search | `lib/bookSearchRules.ts` `rankShelfRows` | A result's cover is the one most readers' shelf copies use. With one or two readers, that's one reader's upload, shown to everyone who searches. |
| Adding from search | `app/api/books/route.ts` | The new copy saves the cover the result showed, so the upload is now on a second shelf. |
| The catalogue | `linkCatalog` in `app/api/books/route.ts`, `lib/buddyReadsServer.ts`, `lib/recommendations.ts`, `lib/import/job.ts`; `lib/catalog/resolve.ts` | The reader's cover is passed as `coverUrl`. Open Library's cover wins when the lookup finds one; otherwise it becomes the new Edition's or Work's cover, or fills one that had none (`fillIn`). Ask the shelf, Discover and book details then show it. |
| Backfill | `lib/catalog/backfill.ts` | Any cover that isn't an Open Library URL goes to the catalogue, uploads included. |
| Reading circles | `lib/buddyReadsServer.ts` | The circle keeps a snapshot of the host's cover, and every joiner's new copy is created with it. |
| Recommendations | `lib/recommendations.ts` | Accepting a recommended book copies the sender's cover. |
| Lists | `lib/lists.ts` | A list item keeps the curator's cover; adding from the list or remixing it copies the cover on. |

**Seen on the test database:** reader1's Dune has an uploaded cover (`febf277a…`). A later account found
Dune through search, got that cover on its own copy, filled the empty catalogue edition with it, and
carried it into its reading circle. Deleting that account (23 Oct) correctly kept the file, because reader1
and the catalogue still use it. Nothing records that the file was reader1's upload.

Our stored copies of Open Library covers (`lib/covers.ts` `mirrorCover`) are also UploadThing URLs. They
are meant to be shared, but nothing stored tells them apart from uploads.

## Why keep uploads private

- **Consent:** the reader uploaded a picture for their own shelf. Nothing tells them it can become the
  cover every other reader sees in search and in the catalogue.
- **Privacy:** an upload is often a photo of their own copy: a hand, a room, a library sticker.
- **Moderation:** today, any upload can become the shared search and catalogue cover for a book with
  no review. One offensive image can spread to every reader who adds that book afterwards.
- **Rights:** a photo or scan of a cover is the uploader's to share on their own shelf. Republishing it
  as Bookmark's catalogue cover is a different use.
- **Deletion:** once an upload has spread, account deletion has to leave it behind (as with reader1's
  Dune), so the uploader can't fully take it back. If uploads never spread, every upload can be deleted
  with its account, and the policy can say so plainly.

**The cost:** a book Open Library doesn't have shows other readers the title tile (the coloured card with
the title) instead of someone's photo. That's what such a book shows today before anyone uploads a
cover. If shared covers for those books turn out to matter, a later "suggest this cover for everyone",
reviewed by staff, would add it back with consent and moderation.

## What it would take

1. **Record uploads.** Add an `Upload` model (`key`, `url`, `userId`, `kind`: avatar, banner or cover),
   written by both upload paths: `app/api/mobile/upload` and the web's UploadThing router. Then
   `isReaderUpload(url)` is one lookup. Account deletion can then delete a reader's uploads by
   `userId`, keeping the in-use check as a guard.
2. **Close each door.** One helper, `shareableCover(url)`, returns the URL only when it isn't a reader
   upload. Use it at each door: the `linkCatalog` input (inside `lib/catalog.ts`, so every caller is
   covered), `rankShelfRows`, the circle snapshot, recommendations, list items, and backfill. Each falls
   back to the catalogue cover, then the title tile.
3. **Clean existing data.** A script, dry run first:
   - Catalogue rows with an UploadThing cover and an Open Library key or ISBN get Open Library's cover
     again (then mirrored).
   - Rows with neither are almost certainly uploads, and are cleared.
   - Circle snapshots, list items and other readers' copies that hold a URL found on someone else's
     shelf as an upload are reset to the catalogue cover.

   Old uploads have no `Upload` row, so this step relies on that heuristic, and the dry run's report
   should be read before anything changes.
4. **Say so.** The privacy policy should state that covers you upload are shown only on your shelf.
   Today's draft doesn't mention that uploads can be shown to others, which is currently true. Add it to
   `docs/store/privacy-changes.md` either way.
5. **Tests.** Cover each door with an uploaded and a mirrored cover. Check that the catalogue never
   takes an upload, and that deleting an account deletes all of its uploads.

About a day of work, mostly the clean-up script and tests.
