# Hardcover monthly reports (changelog proxy)
Fetched: 2026-10-27 (in-app browser). Hardcover has no separate changelog page observed; monthly "Hardcover Report" blog posts serve as release notes.

---
## Hardcover Report for October 2026
Source: https://hardcover.app/blog/hardcover-report-for-october-2026 — published 01/10/2026 — Adam Fortuna
- Aug: released Vibes and API updates. Sep: reliability, bugs, prep.
- **Community: Book Clubs, Buddy Reads, Posts & Events (Team Alpha Testing)** — "shaping up to be our biggest addition to Hardcover since Vibes." Team alpha testing book club, discussions, events, Buddy Reads. Beta group spots still open; "aiming to release Community to beta testers this month!" (i.e. October 2026)
  - Ranked-choice polls in Book Club forum (screenshot)
  - Book Club Most Wanted List (books on most members' Want to Read)
  - Book Club Recommendations List using Vibes recs blending members' preferences
  - Invites: in-app invitations + copyable links for Book Clubs, Lists, Buddy Reads
  - Planned: new Network tab on book pages to see who else read a book / find Buddy Read partners
  - Experience framed as "something between Reddit, social-media groups, and an old-fashion forum"
  - Team book club reading A Short Stay in Hell
- Discover page polish; Vibes pages viewable logged-out; Vibes and Journals in mobile menu
- Recommendations: genre weight based on reader votes; LitRPG/progression fantasy benchmark relevance 88% -> 100%. Series pages "Similar" tab. Search relevance improvements.
- Goals: page and hour goals use daily reading progress; DNF pages count; cross-year reading attributed correctly. "Rated higher/lower than average" comparison thresholds. Series progress handles omnibus editions.
- Reading Journal: browse all entries across books with filters/sorting; notes and quotes at a percentage point; log progress on paused book.
- Lists: edition details in rows; "My lists" filter; "Edit multiple" renamed "Bulk edit".
- Imports: cancel stuck imports >24h; StoryGraph/Goodreads currently-reading/paused import as in-progress.
- Bot protection: Cloudflare "verify you're a human"; traffic spikes 10x-20x on some days.
- Librarian Hub (report review queue) in testing; report backlog acknowledged.
- Most-read/popular books pages now browsable anytime; possible future "Hardcover Reading Pulse" post.
- **Behind the scenes: "We currently have 1,116 Supporters! We started 2026 with 569 Supporters"**; "September also marked our eighth consecutive month of revenue growth"; "Hardcover can pay for everything it needs to keep running"; "Our next goal is to bring in enough revenue to start paying some of the Hardcover Team for their work!"
- "very small and indie team"; Discord "~5,000 readers"
- Team names mentioned: Lia, Jacob (Tender), Adam R, Brooke (Ymir, Australia), Matt (Minman), Adam F.

---
## Hardcover Report for September 2026
Source: https://hardcover.app/blog/hardcover-report-for-september-2026 — published 31/08/2026 — Adam Fortuna
- Hardcover Live #66 (monthly livestream via Riverside), 1 Sep 2026.
- "August was a huge month. We merged 118 Pull Requests"
- **Vibe Book Recommendations** available to all logged-in readers. Supporters create custom Vibes (criteria: genre, world/setting, semantic descriptions, popularity...). Vibes API.
  | Feature | Free | Supporters |
  | Discover Page | yes | yes |
  | Vibe: Book Recommendations | yes | yes |
  | Vibe: Because you Read [Last Book] | yes | yes |
  | Vibe: Based on Your Last Five 5-Star Reads | yes | yes |
  | Create new Vibes | no | yes |
  | "For You" View in Vibes | no | yes |
  | "For You" View on Similar Books | no | yes |
  | Create Vibes through the API | no | yes |
- Discover page replaces Trending in mobile bottom nav.
- **Collaborative Lists (Supporters only)**: owner invites any Hardcover reader; in-app + email notification; byline "List by Adam, Ste & Mari"; per-member ratings sort; "Member Of" tab.
- **OAuth Apps & API tokens** (led by @zivoy): free 5,000 requests/day, Supporters 50,000/day. "Hardcover was built API-first... encouraging experimentation and practical ownership of your own data. That's a promise." Free allowance downloads a library "in under a minute". JWT -> personal access tokens (PATs) with granular permissions; PAT Link Builder; legacy JWTs valid, tentative disable target January 2027. OAuth developer apps; requests count against reader's allowance.
- Want to Read manual reorder now for everyone.
- Dashboard widgets: Next Read widget for all; Reading Activity widget streak indicator.
- Email confirmation now required before onboarding; usernames of unconfirmed old accounts reset 4 Sep.
- Tracking/stats: progress updates collapse into one journal entry per book per day; reading chart assigns pages to actual dates; Audiobooks own colour on Reading Format pie chart; Series Tracker mark-read across series.
- Librarian: auto-close obsolete merge reports; eligible Librarians can auto-run low-impact merges; "edition split"/"not a book" report categories; fiction/nonfiction now a literary-type pill not a genre tag.
- Imports: StoryGraph/Goodreads work in Firefox again; Goodreads compilations extraction. Audible Brazil ASIN lookups.
- Accounts: newsletter opt-in; referrals page revamp; Apple purchase restore for Supporters (implies iOS IAP).
- Report a list; "X readers" -> "X saves"; Unfollow in activity feed; Android nav fixes.
- **What's next**: Book Clubs Alpha (internal) then beta: "Book Clubs, Buddy Reads, Events, Locations, Discussions, and more" (beta signup). **Commercial API Tier** for businesses needing higher rate limits — "no launch date yet". Docs now specify which API fields may be used for what purposes.
- **"We currently have 1,007 supporters!... a year ago and we had 415 Supporters. That's 240% growth in one year."** "More people joined Hardcover in August than in any month before."
- Adam Fortuna is US-based, age 40; UtahJS talk (Inferred: Utah-based — US timezones MST listed).
- Most read Aug 2026: four Dungeon Crawler Carl books + Project Hail Mary.

---
## Hardcover Report for August 2026
Source: https://hardcover.app/blog/hardcover-report-for-august-2026 — published 01/08/2026 — Adam Fortuna
- **Book Vibe Recommendations (Supporter Preview)**: new recommendation engine powering similar books, Discover page, Vibes. Signals: who it's attuned to (you, or you + friends; "maybe even a Vibe for a Book Club?"), World (real-world/fantasy/SF, separate from genre), series position, semantic description (e.g. "cosy fantasy set in space"), popularity, genre, audience ("children's books to spicy reads"), format, like-book/author, dynamic signals (last three authors, last five 5-star books). "vector math and a two-tower recommendation model". **"At no point is data sent to OpenAI, Anthropic, or any other external LLM provider."** Processing within Hardcover's DigitalOcean cluster. Built by Adam Rensel. Started as a Discord bot.
- **Paused** is a new reading status ("seventh-most requested feature"); "Stopped" renamed "Did Not Finish".
- Reorder Want to Read (Supporter preview; "third-most upvoted feature on the roadmap") — implies public upvoted roadmap.
- **Filter Lists** for everyone: hide or label books and authors across Hardcover (feed, widgets); public/private/followers-only; subscribe to others' Filter Lists.
- Docs site redesign.
- **API limits** (as stated in this post): "Rate: 60 API requests/second" [NB: same post earlier says "60/minute limit per user" — inconsistent; see api.md]; Search 1 top-level group/request; Query 5; Mutation 5. Stack: Hasura -> Rails, new Rust Search proxy; two 32 GB database servers.
- "shipped 120 pull requests in July. That's 4 a day"
- Spoiler text in reviews reveals with one click; new books respect privacy default; Goodreads and OpenLibrary imports improved; audiobook lookups across all Audible regions.
- **What's next** (2026 Objectives Review, July 2026): Community – Book Clubs, Discussions (beta target August); **Author Profiles** ("claim" profiles — early stage, author survey); API updates (JWT->PAT+OAuth); **Open Sourcing** — "We don't have a timeline yet".
- "We currently have 884 supporters (+53)!" Goal 1,000.

---
## Hardcover Report for July 2026
Source: https://hardcover.app/blog/hardcover-report-for-july-2026 — published 01/07/2026 — Adam Fortuna (extracted What's New -> Behind the Scenes)
- Adam: "I spent about 45 hours working on Hardcover this month – about 10% of the total time the team spent." "Even though we're not (yet) open source"
- Supporters: Similar Books (powered by Vibes) on every book page; 100 most similar; filter/sort. "two-tower neural network that places every reader and every book into a shared 256-dimensional 'taste space'"; "isn't using any external LLM/AI. It's all running on our local Digital Ocean hardware." Hint: recommend a book for a book club based on everyone in the club.
- Supporters: Filter Lists — modelled on Bluesky Moderation Lists; "Hidden by me" visibility; labels; subscribe to others' lists (example: hide authors who are TERFs, label authors who are politicians).
- New review editor: rich text, slash commands, markdown, Spoiler mark; @-mentions of books, users, series, characters, authors, lists, prompts with notifications. Built for Discussions.
- Search across your lists; numbered pagination.
- Reading Journal "New Entry" button; rereads stat.
- Light / dark / system theme setting.
- What's next: OAuth + PATs; "A new token based API use billing model for businesses building on Hardcover"; "Hardcover started because I needed an API for my own personal projects when Goodreads announced they were deprecating theirs. We plan to keep our API free for users as long as we're around." Third-party services storing PATs must switch to OAuth; NickelHardcover for Kobo mentioned as a locally-run integration.
- Book Groups, Events, Locations, Discussions — launch to team in July; Book Club Beta list; "Still determining if these should be called Groups or Book Clubs."
- "We currently have 831 supporters!" Costs rose (Vibes infra, doubled database) "but... we're still in the positive for the month!"

---
## Hardcover Report for February 2026
Source: https://hardcover.app/blog/hardcover-report-for-february-2026 — published 01/02/2026 — Adam Fortuna
- 2025 Year in Books live (community-wide time capsule; previous 2023, 2024); "inspired by Letterboxd Year in Movies"; Comics/Manga/Graphic Novels sections added.
- Series Tracker returns (Labs) by @emma; sort by Next Release to see series with upcoming books.
- **Follow Authors, Series, Books, Editions, Characters, Publishers** — follows are public. "As we work on more things – including discussions – what you're following will become more important."
- Add/delete books from List page; auto-mark Read at 100% progress or when rating; Profile "Similar Reads" (books in common with another reader).
- Referral users can upgrade to paid; update past goals; audiobook goal progress fixes.
- Next: Librarian Hub; dashboard widgets; Recommendations & Vibes (@Adamr).
- Hiring: Developer and DevRel roles applications open.
- Community projects: unofficial @hardcoverd Discord bot; "Goodreads to Hardcover Sync" (Chrome extension / node / GitHub action) — workaround for Kindle progress: "Until Kindle opens up their API".
- **"We currently have 662 supporters! That's up from 569 a month ago"**; **"Our revenue broke $4k for the month as well, up 40%"**; **"estimated annualized monthly expenses are around $3k/month"** -> "squarely in the black"; "taken 4.5 years"; **2026 goal: 2,000 subscribers**.

---
## Hardcover Report for March 2026
Source: https://hardcover.app/blog/hardcover-report-for-march-2026 — published 01/03/2026 — Adam Fortuna
- **Customizable Dashboards (Supporters)**: multiple named dashboards, widget choice/size/layout. Widgets: Calendar (covers on dates read / release dates), List (list or shelf view), Currently Reading (update progress inline), Feed, Reading Goals, Reading Stats (30d/365d/year/all-time; books, pages, hours listened). All readers get the dashboard; only supporters customise/multiple.
- **Partial Books** (e.g. "The Way of Kings Part 1"/"Part 2") — linked to parent, filtered from series pages.
- Librarian Reports Dashboard / Librarian Hub in progress. Book edit page tabs: Edit, Characters, History (version history with before/after).
- Import duplicate detection (normalised names, external API checks). Merge reliability.
- DNF books stay DNF when rated; Goodreads CSV encoding fix; "appender-level access" permission tier.
- Next: Hiring DevRel + Software Developer; Recommendations; bug backlog; Filtering and Sorting ("One of the most requested features").
- **"We currently have 721 supporters!"** ("might actually have a bug that shows a few more supporters"); "revenue for February should land around $3k... more than $100 a day!"; "It took over a year for us to hit $100 in a month."

---
## Hardcover Report for April 2026
Source: https://hardcover.app/blog/hardcover-report-for-april-2026 — published 01/04/2026 — Adam Fortuna
- Editable dashboard for everyone (single dashboard); List widget for all.
- Supporter Preview: book collection filtering/sorting on all book-list pages (library, lists, goals, prompts, author, publisher, character, series, trending, upcoming).
- "Book Smell" filter (New Book Smell, Old Paper, Petrichor...) — published 1 April; likely April Fools (Inferred; not confirmed).
- Mark dates read as year or year+month ("Not sure when I finished" option).
- Timezone-aware dates.
- "18 New Stats Visualizations"; "advanced reading stats are now available as a preview to all users"; charts link to filtered Library (e.g. audiobook vs physical vs ebook).
- **"We currently have 672 supporters!"** — down from 721 because expired subscriptions weren't being removed (correction of March figure).

---
## Hardcover Report for June 2026
Source: https://hardcover.app/blog/hardcover-report-for-june-2026 — published 31/05/2026 — Adam Fortuna
- "more than 90 changes shipped" in May.
- Edit Multiple (bulk edit) for Supporters and librarians: status, rating, privacy, genres, moods, tags, lists, follow status.
- Widgets Series Tracker, Following Activity, Reading Activity — now available to all. Edit date of progress update (streaks).
- Onboarding "follow other readers" tabs: Hardcover, Instagram, YouTube, TikTok, BlueSky.
- Default reading format preference (physical/audiobook/ebook) collected in onboarding.
- Delete review; edition country flags.
- Librarians: author standards; tag overrides for genres, moods & content warnings (lockable; otherwise community-tag-driven); ISBN validation; "Introduction" contributor.
- Perf: feed ~3s -> 45ms; **search moved to separate Rust service ("search was more than half of all traffic")**, 2s timeout; permanent /id/:model/:id URLs; ISBN redirect /edition/isbn/<isbn>.
- What's next: Moderation lists (BlueSky concept) -> shipped as Filter Lists; Book Vibes; **Starter Packs** (BlueSky concept, lists of users; for Book Clubs, feeds, author pages); API changes (OAuth, PATs, limits) — "one of the pre-reqs for open sourcing Hardcover"; **"Native iOS updates are in the works for 'open in app', push notifications and native widgets. These are part of making the mobile apps feel much more native"**.
- **"We currently have 755 supporters!"** "keeping Hardcover independent and ad-free"; May "second most profitable month yet". iOS subscription sync issues; Restore Subscriptions on iOS (IAP).

## Hardcover Report for May 2026 (dek only, not opened)
Source: https://hardcover.app/blog — "Filtering and sorting, reading activity widget and a bunch of librarian updates." 30/04/2026
