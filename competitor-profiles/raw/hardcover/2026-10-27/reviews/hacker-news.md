# Hardcover — Hacker News

Fetch date: 2026-10-27
Index: https://hn.algolia.com/api/v1/search?query=hardcover.app&tags=story

## Stories about Hardcover
| Date | Title | Points | Comments | HN link |
|---|---|---|---|---|
| 2023-10-02 | Show HN: Hardcover – Letterboxd for Books | 31 | 24 | https://news.ycombinator.com/item?id=37744905 |
| 2024-08-15 | We survived 10k requests/second: Switching to signed asset URLs in an emergency | 147 | 168 | https://news.ycombinator.com/item?id=41260098 |
| 2025-01-15 | Hardcover.app's 2024 Year in Books | 1 | 1 | https://news.ycombinator.com/item?id=42708433 |
| 2025-05-03 | We fell out of love with Next.js and back in love with Ruby on Rails | 523 | 519 | https://news.ycombinator.com/item?id=43881035 |
| 2025-12-03 | Show HN: trending books by month bump chart with Hardcover data | 2 | 0 | https://news.ycombinator.com/item?id=46139483 |
| 2022-05-01 | $9,207 Spent, 400 Users: 8 Lessons From Hardcover's First Year | 2 | 0 | https://news.ycombinator.com/item?id=31228552 |

Observation: Hardcover's biggest HN reach is engineering blog posts (Rails migration, scraping incident), not the product. This is a signal of a developer-adjacent audience and founder profile.

## Show HN thread (2023-10-02) — user comments (paraphrase + short verbatim)
- bejd: left Goodreads -> StoryGraph -> Hardcover, "haven't looked back"; StoryGraph "felt like it was missing a few things"; rarely uses social features.
- hatebot: "immediately fell in love with the design"; brought partner and friend over.
- irreverentmike: "I am a huge fan of hardcover!"
- mig4ng: "Hardcover looks amazing overall"; wants bulk list editing, faster Want to Read (100-200ms lag), hide the feed, open-source.
- talonx: "Storygraph does not cut it for me"; Load More scroll bug; wrong profile counts; wants MFA.
- _hzw: wants in-the-moment reading notes; argued people post publicly "because they want to be seen".
- bwb: on live shared reactions, "to me that sounds terrible".
- Founder 2023: site far from covering ~$1,000/month costs; born from Goodreads API shutdown.

## Rails migration thread (2025-05-03)
Fetch of first 100k chars: comments are framework debate; no product feedback surfaced in that portion. Search-snippet summary (unverified against full thread) mentioned one commenter calling the app sluggish with UI glitches and another still using it for the UI, open API and the team's love of reading; hosting costs rose ~10x in a few months, cited as a reason to migrate.

## Scraping incident (2024-08-15)
Someone hit Hardcover's public Google Cloud Storage bucket at ~10k req/s for ~7 hours; fix was signed URLs + per-user rate limiting. Impact was mainly cost (bootstrapped, paid by founder). No reported user-facing outage in thread.

## Recent comment mentions (2026)
- 2026-09-20 kidnoodle (item 49774013): import from Goodreads/StoryGraph works "particularly nicely with hardcover".
- 2026-09-06 KPGv2 (item 49582680): "according to Hardcover, I've read 76 fiction books this year" (heavy reader, usage mention).
- 2026-08-24 l__l (item 49419388): asks how a new app differs "from alternatives like Hardcover, Fable, etc." — Hardcover now a reference point among HN readers.
