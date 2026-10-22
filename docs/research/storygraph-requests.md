# What StoryGraph readers ask for

Research into the public feature-request board of The StoryGraph, to find out what heavy readers want and which of those wants Bookmark should build. Data pulled 22 Oct 2026.

## Method

- Source: [roadmap.thestorygraph.com/requests-ideas](https://roadmap.thestorygraph.com/requests-ideas). This is a Noora board, described as "feature requests or ideas from our Plus members", so it is paying, engaged readers.
- Every post was fetched through the board's public GraphQL endpoint (`POST /graphql`, `posts(input: CursorInput!)`, 100 per page, newest first). The raw data is in [storygraph-requests-2026-10.json](storygraph-requests-2026-10.json): title, description, upvotes, comment count, status and URL for each post, sorted by votes.
- Statuses: 1,675 posts are Open, 110 are Shipped, and 22 are on StoryGraph's roadmap (11 Medium-term, 5 Up Next, 4 Ideas, 2 Long-term). Shipped posts are left out of the totals below.
- Themes were matched by keyword on the title plus the first 300 characters of the description. One post can count toward several themes, so the totals overlap. Treat them as a rough measure of demand, not exact figures.

## Theme totals (open and planned posts)

| Theme | Posts | Votes |
|---|---:|---:|
| Stats and wrap-ups | 506 | 6,252 |
| Tags, lists and shelves | 461 | 6,236 |
| Ratings | 326 | 5,187 |
| TBR and statuses | 255 | 4,562 |
| Social (friends, clubs, buddy reads) | 243 | 3,714 |
| Challenges and goals | 312 | 3,533 |
| Authors | 126 | 3,186 |
| Editions and formats | 203 | 2,251 |
| Series | 65 | 2,149 |
| Upcoming releases and notifications | 46 | 1,910 |
| Audiobooks and narrators | 99 | 1,387 |
| Notes and quotes | 66 | 1,268 |
| Mobile, widget, offline | 74 | 1,072 |
| Privacy | 72 | 1,071 |
| Bulk edit | 11 | 425 |
| Spice and content warnings | 21 | 384 |
| Spoilers | 9 | 136 |

Stats, tags and ratings are spread across hundreds of small requests. Authors, series and releases are the opposite: a few posts with very high vote counts. Those posts are the clearest single wants on the board.

## Top 40 open requests

| # | Request | Votes | Comments | SG status |
|---:|---|---:|---:|---|
| 1 | [Ability to follow an author](https://roadmap.thestorygraph.com/requests-ideas/ability-to-follow-an-author) | 455 | 19 | |
| 2 | [Series Tracker](https://roadmap.thestorygraph.com/requests-ideas/overview-of-series-i-m-in-the-middle-of) | 436 | 14 | |
| 3 | [Add (private) notes to books](https://roadmap.thestorygraph.com/requests-ideas/add-notes-field-to-to-read-list) | 373 | 58 | Medium-term |
| 4 | [Upcoming Releases](https://roadmap.thestorygraph.com/requests-ideas/upcoming-releases) | 321 | 12 | |
| 5 | [Author pages](https://roadmap.thestorygraph.com/requests-ideas/author-pages) | 312 | 24 | Medium-term |
| 6 | [Ability to follow a series](https://roadmap.thestorygraph.com/requests-ideas/ability-to-follow-a-series) | 307 | 6 | |
| 7 | [Phone Widget](https://roadmap.thestorygraph.com/requests-ideas/phone-widget) | 296 | 25 | |
| 8 | [Batch/Bulk Edit Books (Tags, TBR, Removal, etc.)](https://roadmap.thestorygraph.com/requests-ideas/batch-edit-book-tags) | 286 | 25 | |
| 9 | [Quotes](https://roadmap.thestorygraph.com/requests-ideas/quotes) | 265 | 21 | Medium-term |
| 10 | [Different rating for each read](https://roadmap.thestorygraph.com/requests-ideas/different-rating-for-each-read) | 231 | 6 | |
| 11 | [Ability to Filter/Sort Author Results](https://roadmap.thestorygraph.com/requests-ideas/ability-to-filter-sort-author-results) | 189 | 16 | |
| 12 | [Heat/Smut/Steam/Spice level for Romance and Erotica books](https://roadmap.thestorygraph.com/requests-ideas/heat-smut-level-for-romance-and-erotica-books) | 175 | 20 | |
| 13 | [Mark authors/books as "will not read"](https://roadmap.thestorygraph.com/requests-ideas/mark-authors-books-as-will-not-read-) | 168 | 10 | |
| 14 | [Ability to create ordered lists](https://roadmap.thestorygraph.com/requests-ideas/ability-to-create-ordered-lists) | 157 | 9 | Medium-term |
| 15 | [Rating for audiobook narrator](https://roadmap.thestorygraph.com/requests-ideas/rating-for-audiobook-narrator) | 156 | 17 | |
| 16 | [Sort Books by Storygraph Rating](https://roadmap.thestorygraph.com/requests-ideas/sort-books-by-storygraph-rating) | 146 | 14 | |
| 17 | [Offline mode on mobile app](https://roadmap.thestorygraph.com/requests-ideas/offline-mode-on-mobile-app) | 129 | 8 | Long-term |
| 18 | [See Books In Common on Friends Profile](https://roadmap.thestorygraph.com/requests-ideas/see-books-in-common-on-friends-profile) | 125 | 7 | |
| 19 | [A section for 'favorite authors'](https://roadmap.thestorygraph.com/requests-ideas/a-section-for-favorite-authors-) | 124 | 2 | |
| 20 | [Timeline of books read](https://roadmap.thestorygraph.com/requests-ideas/timeline-of-books-read) | 124 | 5 | |
| 21 | [New Book Notifications](https://roadmap.thestorygraph.com/requests-ideas/new-book-notifications) | 121 | 12 | |
| 22 | [Publication Day Notifications](https://roadmap.thestorygraph.com/requests-ideas/remind-when-new-books-are-released) | 114 | 7 | |
| 23 | [Default edition format in search results](https://roadmap.thestorygraph.com/requests-ideas/default-edition-in-search-results) | 106 | 11 | Medium-term |
| 24 | [Filter reading challenges](https://roadmap.thestorygraph.com/requests-ideas/filter-reading-challenges-by-length-start-date) | 104 | 15 | Medium-term |
| 25 | [Privacy settings for books](https://roadmap.thestorygraph.com/requests-ideas/privacy-settings-for-books) | 102 | 8 | |
| 26 | [Status across multiple editions not shown](https://roadmap.thestorygraph.com/requests-ideas/status-in-multiple-editions-not-shown) | 97 | 25 | Up Next |
| 27 | [Increase Up Next Queue Limit to 10](https://roadmap.thestorygraph.com/requests-ideas/up-next-5-) | 94 | 8 | |
| 28 | [Sort to-read pile by average rating](https://roadmap.thestorygraph.com/requests-ideas/sort-to-read-pile-by-average-rating) | 92 | 3 | |
| 29 | [See your followers](https://roadmap.thestorygraph.com/requests-ideas/see-your-followers) | 90 | 3 | |
| 30 | [Libby/Storygraph](https://roadmap.thestorygraph.com/requests-ideas/libby-storygraph) | 89 | 9 | |
| 31 | [Filter Reading Challenge Prompts](https://roadmap.thestorygraph.com/requests-ideas/filter-reading-challenge-prompts) | 87 | 18 | |
| 32 | [Library Label](https://roadmap.thestorygraph.com/requests-ideas/library-label) | 86 | 12 | |
| 33 | [Specific Date added for TBR books](https://roadmap.thestorygraph.com/requests-ideas/specific-date-added-for-tbr-books) | 79 | 17 | |
| 34 | [The StoryGraph Yearly Most Acclaimed [awards]](https://roadmap.thestorygraph.com/requests-ideas/the-storygraph-yearly-most-acclaimed-awards-) | 78 | 3 | |
| 35 | [Allow reporting of spoiler reviews](https://roadmap.thestorygraph.com/requests-ideas/allow-reporting-of-spoiler-reviews) | 78 | 22 | Medium-term |
| 36 | [Filter read books by rating](https://roadmap.thestorygraph.com/requests-ideas/filter-read-books-by-rating) | 75 | 9 | |
| 37 | [Narrator & Illustrator Stats](https://roadmap.thestorygraph.com/requests-ideas/narrator-illustrator-stats) | 74 | 10 | |
| 38 | [Filter options for series](https://roadmap.thestorygraph.com/requests-ideas/filter-options-for-series) | 73 | 5 | |
| 39 | [Save/Follow Public Tags/Lists](https://roadmap.thestorygraph.com/requests-ideas/save-follow-public-tags) | 72 | 8 | |
| 40 | [Tag Groups](https://roadmap.thestorygraph.com/requests-ideas/tag-groups) | 71 | 12 | |

What readers actually mean, from the post text:

- **Notes (#3).** The most common use is remembering *who recommended* a book, or the quote or review that put it on their list. It is a social signal disguised as a notes field.
- **Phone widget (#7).** People want to see what they're currently reading and update progress without opening the app.
- **Follow a series (#6).** It is separate from following an author, because readers don't want alerts for everything an author writes.
- **Spice level (#12).** It is about mood: "sometimes something spicy, sometimes clean and sweet". That fits Bookmark's core reader (romance and romantasy).

Social requests are smaller one by one, but they are exactly Bookmark's wedge:

- Books in common with a friend (125)
- Send a book recommendation to a friend (65)
- See friends reading the same book right now (49)
- Mark interest in a buddy read (24)
- @everyone tagging in book clubs
- Hide others' reviews until I've finished, in a buddy read or club (12)
- Ranked-choice book club polls (12)

StoryGraph's own "Book Clubs V2" is still only in its Ideas column.

## Where Bookmark stands

From a codebase audit on 22 Oct 2026, at medium depth. "Missing" means nothing was found in the schema, routes or components.

| Request | Bookmark | Evidence or gap |
|---|---|---|
| Follow an author, author pages | Missing | `Book.author` is a plain string; there is no Author model or route |
| Series tracker, follow a series, next in series | Missing | No series field. Goodreads import strips the series suffix (`lib/import/formats.ts`) |
| Upcoming releases, release notifications | Missing | No release date on books |
| Private notes | Has | `Note` model, `app/api/books/[bookId]/notes`, `BookNotesModal.tsx` |
| "Recommended by" on a book | Missing | Quick win in progress |
| Quotes | Partial | A note without a title is a quote. No highlights and no quote search |
| Paused, DNF | Has | `Status` enum, `stoppedAt`, `BookRead.stoppedAtPage` |
| Will not read / not interested | Missing | Quick win in progress |
| Different rating per reread | Has | `BookRead.rating`, `Book.timesRead`, a re-reads stat |
| Ordered lists, favourites | Has | `ListItem.position`, `User.favouriteIds`, `/favourites` |
| Tier lists | Missing | |
| Tags on books, tag groups | Partial | Only `List.tags` exists |
| Bulk edit | Missing | Quick win in progress |
| Spice level, content warnings, moods, tropes | Missing | Already planned for slice 3 (warnings, moods) |
| Narrator rating, audiobook minutes | Missing | |
| Libby or Kobo sync | Missing | CSV import exists for Goodreads, StoryGraph and Bookmark files |
| Status follows the work, not the edition | Partial | Shared `Work`/`Edition` models are on `main` and `Book.workId`/`editionId` link to them; status and rating still live on each reader's `Book` row |
| Stats, yearly wrap, share graphics | Has | `StatsView.tsx`, `Charts.tsx`, Wrapped with a share image. No monthly wrap |
| Reading goals, challenges | Partial | Yearly book goal and staff-made Quests; no page goals and no user-made prompt challenges |
| Followers list | Has | `Follow`, followers and following routes |
| Books in common with a friend | Missing | Quick win in progress |
| Recommend a book to a friend | Missing | Quick win in progress |
| Friends currently reading this book | Partial | "Picked by people you follow" exists; no live currently-reading view |
| Circles: schedule, progress-locked spoilers, reactions | Has | `BuddyRead.schedule`, comments pinned to percent progress |
| Circle polls, @mentions | Missing | |
| Whole-review spoiler flag | Has | `Book.reviewSpoiler`, `User.showSpoilers` |
| Per-book privacy, hide activity from feed | Partial | `reviewPrivate`, profile-level settings only |
| Push or email notifications | Partial | In-app bell only |
| Phone widget, offline | Partial | Web manifest only; no service worker |
| Warm or sepia theme | Partial | Light, dark and system only |

## Where each theme goes

- **Now: quick wins on branch `claude/storygraph-quick-wins`.** Will not read, books in common, recommend to a friend, "recommended by" on books, and bulk edit. All free, no AI, and built on existing models.
- **Slice 1 (shared catalog).** Add `Author` and `Series` models alongside Work/Edition, with a series position on each Work. Fill series from Open Library and the Goodreads title suffix that import currently throws away. This also fixes "status across editions" and "ratings follow the book".
- **New slice: follow authors and series, plus release notifications.** Depends on slice 1. Covers author pages, follow author, follow series, series tracker, upcoming releases, and publication-day alerts. It needs email or push notifications, which Bookmark doesn't have yet. This theme has about 2,000 votes, the largest pool of demand on the board.
- **Slice 3 (circles as the product).** Spice level alongside content warnings and moods; narrator rating alongside audiobook minutes. Circle polls (ranked choice) and @everyone mentions are cheap additions here.
- **Slice 4 (Plus).** Monthly wrap graphics (already planned), and theme variants including a warm or sepia light theme (6 votes on its own, but it fits personalisation).
- **Later or unplanned.** Phone widget and offline (needs a PWA service worker first), Libby sync (no public API), tier lists, tags on books with tag groups, user-made reading-prompt challenges.
