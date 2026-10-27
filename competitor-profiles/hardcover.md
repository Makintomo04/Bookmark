# Hardcover — Competitor Profile

**URL**: https://hardcover.app
**Generated**: 27 Oct 2026
**Depth**: deep profile
**Raw data**: `competitor-profiles/raw/hardcover/2026-10-27/` (scrapes/ and reviews/)

> Evidence labels: **Observed** = a source says it (linked or in raw files). **Inferred** = our reading, with confidence. **Implication** = an option for Bookmark, not a conclusion.

---

## TL;DR

1. **Hardcover is shipping our wedge this month.** The October 2026 Hardcover Report says Book Clubs, Buddy Reads, Discussions and Events are in team alpha, "aiming to release Community to beta testers this month". Club invites go by link. Clubs get a "Most Wanted" list and blended recommendations, and a Network tab will find buddy-read partners (Observed, `scrapes/changelog.md`). **Assume they'll lock discussion by progress.** The launch posts don't mention it. But in Sep 2024 co-founder Ste said on the roadmap that general discussions "only show up until the point you're read" (Observed, `scrapes/roadmap-buddy-reads.md`).
2. **It's growing fast from a small base.** Members went from 22.5k (Jan 2025) to 90k (May 2026), and Aug 2026 was the record month for signups. Supporters reached 1,116 in Oct 2026, about 1% of members. Revenue is around $3.5k+/month, profitable but with an unpaid team (Observed, `scrapes/metrics-timeline.md`).
3. **The audience is a different reader.** It skews techy, indie, anti-Amazon and SFF. The founder models it on Letterboxd, and the API ecosystem is KOReader, Kobo, Obsidian and MCP. We found no romance, romantasy or BookTok adoption signal, and one review says books outside SFF lack covers and descriptions. The Reddit pass (done through ChatGPT, unverified) supports this. Hardcover was "not prominent" in either r/RomanceBooks "which tracking app?" thread (Jan 2025, +51; Mar 2026, +58). r/romantasy readers are asking for spice-aware discovery and tracking in one app, and say even Fable's spice ratings miss newer indie titles (Inferred, medium-high confidence).
4. **The mobile app is its weak spot.** It "is effectively a wrapper for the website" (Hardcover, Nov 2025). Slow and crashy is the top complaint, in about 18 store mentions from 2023 to Sep 2026. It has 66 US iOS ratings and 10K+ Android downloads, and Android was last updated Dec 2025.
5. **It's also a supplier to us.** Our search falls back to Hardcover's GraphQL catalogue (`apps/web/lib/hardcover.ts`, BOO-29). We rely on a competitor's free API, which is rate-limited, labelled beta, and has a commercial tier "being built".

---

## At a Glance

| Metric | Value | Source |
|---|---|---|
| Tagline | "Book smart." / title "Social discovery for serious book lovers" | Homepage, 27 Oct 2026 |
| Founded | Apr–May 2021, right after Goodreads closed its API | About, blog |
| Founders | Adam Fortuna (CEO, Salt Lake City, ex-Code School/Pluralsight); Ste Dobrescu (co-founder, design/CPO, London) | About page |
| Entity | Hardcover LLC; "100% employee-owned" (2022 page) | App Store, comparison page |
| Funding | Bootstrapped, "haven't taken funding" | Homepage, FAQ |
| Team | About 15 people (May 2026), mostly part-time for equity or volunteers; Adam about 30 h/week since May 2026, part-time at Libro.fm | May 2026 report |
| Members | 90,000 (May 2026) | May 2026 report |
| Paying Supporters | 1,116 (Oct 2026); goal 2,000 by end of 2026 | Oct 2026 report |
| Revenue | $1.2k → $3.5k/month over the year to May 2026; profit $1k+/month; 8 straight months of revenue growth (Oct 2026) | Reports |
| Discord | About 5,000 members | Oct 2026 report |
| Domain rank / organic traffic / referring domains / keywords | **Unavailable**: no SEO data source connected | — |
| Similarweb (third-party, low quality) | Global rank about #98.6k; 40.7% US; 9:25 average visit; 59% direct; misfiled under "Groceries" | `scrapes/similarweb.md` |

---

## Positioning & Messaging

**Value proposition (Observed):** "Book smart." with "Track every book, share them with the world (or don't) and find new life-changing reads." Four pillars: Find / Track / Connect / Discover.

**Target audience (Inferred, high confidence):** Goodreads refugees who dislike Amazon, and data-minded "power readers". Letterboxd is the explicit model. The audience is genre-neutral in copy but SFF-leaning in practice.

**Positioning angle:** Indie, anti-corporate, transparent. "A rebellion against corporate giants… the best social network for readers."

**Key messaging themes:**
- **Independence.** "Scrappy indie book app over the Amazon alternative"; bootstrapped; monthly public reports with member, supporter and revenue numbers (blog).
- **Granular, private-by-choice tracking.** Half stars, per-book privacy, moods and content warnings, editions (homepage).
- **Community-built.** Volunteer librarians, public roadmap with votes, monthly live stream, Discord (roadmap, FAQ).
- **No external AI.** Vibes recommendations "At no point is data sent to OpenAI, Anthropic, or any other external LLM provider" (Aug 2026 report). Note that an OpenAI-based "Ask Jules" librarian assistant also exists (reviews/articles.md).

---

## Product & Features

### Core capabilities (Observed, Oct 2026)
- **Statuses:** Want to Read, Currently Reading, Read, DNF, Paused (added Aug 2026); "Not interested". No custom shelves; lists cover that.
- **Ratings and reviews:** half stars; rich-text and markdown reviews with spoiler marks and @-mentions (Jul 2026).
- **Progress and journal:** page or % progress, journal entries (notes, quotes at a %, progress), streaks, rereads.
- **Stats:** basic stats free, any date range for Supporters; 18 chart types, audiobook share. 2025 personal Wrapped and a community "Year in Books".
- **Goals:** multiple, by books, pages or hours.
- **Lists:** unlimited, ranked, prompt lists; **Filter Lists** (Bluesky-style moderation lists); **Collaborative Lists** (owner must be a Supporter).
- **Taxonomy:** community-voted genres, moods, content warnings and tags; spoiler tags. **No spice or trope meter observed**, which was requested in a 2024 review.
- **Recommendations ("Vibes", Aug–Sep 2026):** in-house two-tower model. Inputs include setting, semantic description ("cosy fantasy set in space"), audience (up to "spicy reads"), format, and blending several readers. Browsing is free; creating Vibes needs Supporter.
- **Series and follows:** Series Tracker, follow authors, series, books, publishers and characters (Feb 2026). **Release alerts are still "Planned"** (187 votes).
- **Social today:** one-way follows, feed, mentions, "Similar Reads" between profiles, per-book privacy (Public / Following / Private). No DMs observed; feed comments "Under consideration".
- **Imports and exports:** Goodreads CSV, StoryGraph CSV, custom CSV (beta); JSON export (complaint that it is hard to reuse).
- **Audiobooks and editions:** format per edition, hours stats and goals, Audible ASIN lookup across regions; status on the work, edition chosen per read.
- **Data model:** anyone can fill empty fields; editing existing data needs Supporter or an approved Librarian; Librarian Hub in testing.

### In flight (Observed, Oct 2026 report and roadmap)
- **Community:** Book Clubs, Buddy Reads, Posts, Events, Locations, Discussions. Ranked-choice polls, club Most Wanted list, club-blended Vibes, invite links, Network tab for buddy-read partners. Described as "between Reddit, social-media groups, and an old-fashion forum." Roadmap: Buddy Reads/Book Clubs "In progress – Limited User Rollout" (105 votes); Book discussions in progress (97 votes; first started 2023, paused 2024, resumed Aug 2026).
- **What users asked for on the Buddy Reads thread** (`scrapes/roadmap-buddy-reads.md`):
  - comments hidden as spoilers "until your progress hits their same percentage" (2024)
  - spaces "only viewable by those you invite"
  - a book of the month picked "via a poll"
  - "see everyones reading progress"
  - bringing a friend group over from a separate messaging chat (Jul 2026)
  
  Co-founder Ste's 2024 reply says discussions "only show up until the point you're read", so locking by progress looks intended. Status timeline: Planned (3 Jul 2026), In progress with internal beta in August (29 Jul 2026), beta testers in October (Oct report).
- Native iOS push notifications, widgets and "open in app" (announced Jun 2026).
- Author profiles and claiming; commercial API tier; Starter Packs; open source (top roadmap item, 309 votes, "no timeline yet").

### Integrations (Observed)
- Public GraphQL API, the same one their apps use; beta; personal tokens and OAuth (Aug 2026). 24 community projects are showcased: KOReader (★462), Kobo (NickelHardcover), Audiobookshelf, Obsidian, 2 MCP servers, Softcover (native iOS client), Calibre Web Automated, Readwise.
- No native Kindle or e-reader sync. The workaround is Kindle → Goodreads → Hardcover. No Libby observed.

### Product direction signals
- High shipping velocity: 90–120 PRs a month (May–Aug 2026). Monthly report on about the 1st, monthly live stream (#66 in Sep 2026).
- 2026 focus so far: personalisation (dashboards, Vibes, Similar Books), then **community**. Infrastructure moved to Rails + Inertia (May 2025), with a Rust search service. Cloudflare bot protection added Oct 2026 after 10–20× bot spikes, which is also why our research fetches got 403s.

---

## Pricing (Observed, /supporter, 27 Oct 2026)

| Tier | Price | Key inclusions |
|---|---|---|
| Free ("Forever Free") | $0 | Unlimited books and lists, imports, add by ISBN, basic stats, apps, browse Vibes, API 5k/day |
| Supporter | **$4.99/mo or $49.99/yr** | Stats for any date range, create Vibes and For You, librarian edit access, Supporter Discord, multiple dashboards, bulk edit, collaborative lists, add books by title, early "Supporter Preview" features, flair, API 50k/day |

- **Trial:** none mentioned. **Referrals:** 2 referrals = 1 free month, uncapped. USD only on the page; iOS uses Apple in-app purchases.
- **Other revenue:** Bookshop.org and Amazon affiliate links (`tag=hardcoverapp-20`) on book pages, which sits awkwardly next to the anti-Amazon message. The FAQ floats future "carefully designed book promotion" for authors, but no banner ads.
- **Perception (thin):** framed as community support (Book Riot). Complaints target paywalled genre stats and paying for a buggy app, not the price itself.
- **vs Bookmark Plus:** we're at $29.99/yr ($24.99 Founding Reader). Hardcover, StoryGraph Plus and Fable Plus all cluster at $49.99/yr.

---

## Customers & Social Proof

| Source | Rating | Volume |
|---|---|---|
| App Store US | 4.2 (4.15) | 66 ratings, v2.1.3 (19 Jun 2026) |
| App Store GB | 4.0 | 20 ratings |
| Google Play | 3.6–4.0 (pages disagreed) | 244 reviews, 10K+ downloads, last update 18 Dec 2025 |
| Product Hunt | 4.8 | 15 reviews (launch crowd, Mar 2022 and Sep 2023) |
| Trustpilot / G2 | none | — |

**Inferred:** about 90 store ratings against 90k members means usage is overwhelmingly web, and mobile isn't where its fans live.

**Praise themes** (reviews/):
1. **Design beats Goodreads and StoryGraph**, about 15 mentions. "Miles ahead of good reads" (App Store GB, Jul 2026).
2. **Indie and transparent**, about 7 mentions. A "passion project not affiliated to any of the big corpo's".
3. **Imports work**, about 5 mentions, with caveats: lost start dates, everything treated as physical.
4. **Edition, audiobook and tracking granularity**, about 4 mentions.
5. **Light-touch social**: likes that it isn't "too much like a social platform" (GB, Jan 2026). One reader moved from Fable "because of some unfortunate trolling" and praised Hardcover's interaction controls (r/books, Mar 2026, via ChatGPT).
6. **Public roadmap and active development**: "A public roadmap! Please take note, everyone" (r/Booktokreddit, May 2026, via ChatGPT).

**Reddit view** (`reviews/reddit-via-chatgpt.md`; ChatGPT-reported, links not openable by our tools):
- The most balanced take is the May 2026 r/Booktokreddit comparison: "most promise, but is definitely not there yet". It found the UI "too cluttered and noisy" and the database not thorough enough. That cuts against the store reviews' design praise; UI taste varies.
- Using several apps at once is common: Hardcover and StoryGraph together, or "all three".
- Nothing found on Supporter pricing, and no reactions yet to the Community beta.
- The app's subreddit is **r/hardcoverapp**.

**Complaint themes:**
1. **Slow, crashy mobile app**, about 18 mentions from 2023 to Sep 2026. "It's infuriatingly slow" (GB, May 2026).
2. **Feels like a web wrapper**, about 5 mentions.
3. **Catalogue gaps outside bestsellers and SFF**, about 7 mentions. The founder calls book data "a mess outside the top bestsellers".
4. **Onboarding and account failures**, about 4 mentions.
5. **Paywalled stats, JSON-only export**, about 3 mentions.

---

## SEO & Content Strategy

- **Metrics unavailable** (no SEO tool connected). We have not estimated them.
- **Observed:** book pages are public, crawlable, and carry schema.org Book JSON-LD with aggregateRating (Dune: 6,360 ratings). robots.txt is open; **no sitemap** (/sitemap.xml is 404). The Jan 2024 post claims "20x search traffic in 4 months".
- **Content:** monthly reports are the main content engine, plus engineering posts. Engineering posts get the HN reach: the Rails migration post scored 523 points.
- **Comparison pages:** "Goodreads vs. Hardcover" (2022, stale) and "13 Reasons Why We're Building a Better Goodreads". No StoryGraph or Fable comparison observed.
- **Press page** frozen at early 2025 (Book Riot, SlashGear, TechCrunch 2023).

---

## Strengths & Weaknesses

### Strengths
- **Momentum and trust:** 4× member growth in a year, radical transparency, beloved indie identity (reports, reviews).
- **Fast, public shipping cadence** with a voting roadmap, so users feel heard (roadmap, PR counts).
- **Tracking depth equal to or beyond StoryGraph:** editions, audiobook hours, journal, Filter Lists, dashboards, series tracker (features).
- **Ecosystem moat with technical readers:** an open API and 24+ community integrations. Nobody else in the category has this (docs showcase).
- **Catalogue plus librarian community** that improves the data, with Supporters funding the edit rights.
- **Already building clubs**, with recommendations (Vibes) that can blend a group's taste. That is a group feature we don't have.

### Weaknesses
- **Mobile is a web wrapper:** slow, crashy, rarely updated; native push and widgets only "in the works" (stores, Jun 2026 report).
- **Catalogue thin outside SFF and bestsellers**, which is exactly where romance and indie or Kindle Unlimited romantasy live (reviews; founder quote). *Inferred, medium confidence.*
- **Social has been thin until now:** one-way follows and a feed; community lived on Discord (SlashGear Nov 2024; Bookwise Mar 2026).
- **Capacity:** unpaid, part-time and volunteer team; Discussions took three years to come back from pause.
- **No romance-specific tooling observed:** no spice or trope meter, release alerts only planned.
- **Monetisation is small:** about 1% convert and profit is about $1k/month. One paid hire would be a big step for them.

---

## Competitive Implications for Bookmark

**Where they're strong vs. us**
- Credibility and an existing 90k-member network. Any reader we recruit may already have friends there.
- Tracking breadth and an open API ecosystem.
- Recommendations that can blend a group's taste, before we've shipped Ask the shelf.

**Where we may be strong vs. them** (hypotheses, not yet evidenced by our own users)
- **Native mobile app** (Expo, push in v1) against their web wrapper. Circles live on phones mid-chapter, and their mobile weakness is their most-cited complaint.
- ~~Progress-locked circles~~ **Not a differentiator.** StoryGraph already locks by progress, and Hardcover's co-founder has said its discussions will too. Treat progress-locking as table stakes. Compete on how well it works: per-chapter versus percentage locking, audiobook timestamps, and catching up quietly.
- **Private and small by default.** Their model is public-first ("Reddit, social-media groups, forum") with public follows. Ours is the group chat for your book.
- **Romance and romantasy fit:** spice (romance-only), tropes, and catalogue coverage of KU and indie romance.
- **Price:** $29.99 against $49.99 per year.

**Opportunities**
- **Spice-aware discovery plus tracking in one app.** r/romantasy asks for exactly this (Feb 2026). Hardcover has no spice meter, and Fable's spice ratings miss newer indie titles. Our romance-only spice plus indie/KU catalogue coverage aims straight at this.
- Own "romance/romantasy readers' Hardcover". Their reader base and catalogue skew SFF, and no one there is speaking to our ICP.
- Release alerts and author/series following. It's their #2 roadmap ask (187 votes, still Planned) and our validated #1 demand (StoryGraph requests, about 2,000 votes). Shipping slice 7 first beats both.
- "Two apps" also happens on Hardcover: users pair it with StoryGraph, or with Discord for community. Our one-app message lands with these readers too.
- An import path from Hardcover. Its export is JSON, and nobody makes leaving easy. *Option: add a Hardcover JSON importer*, worth checking against their terms first.

**Threats**
- **Community beta (Oct 2026) narrows our wedge** from "nobody does small-group reading well" to "they do it on web". Watch for spoiler or progress locking, private clubs, and mobile support. If they ship all three well, our differentiation falls back to native mobile, romance fit and price.
- **Supplier risk:** our search fallback depends on their free API: 5k/day, beta, JWT cut-off Jan 2027, commercial tier "being built". Their terms allow catalogue (non-user) data for commercial products. User-owned data is off limits, which we already respect. LLM training on API data is prohibited. Retrieval for Ask the shelf isn't training, but keep it that way. If they gate commercial use or restrict, our indie and KU coverage drops.
- **Vibes plus clubs plus 90k members** could make them the default "Goodreads alternative with friends" before we launch.

**Next research steps**
1. ~~Manual Reddit pass~~ Done through ChatGPT (27 Oct). Still open: open the cited threads yourself to confirm the quotes, and watch r/hardcoverapp for reactions to the Community beta.
2. **Join their Community beta** (signup is open) and record: spoiler handling, privacy of clubs, mobile experience, host tools.
3. **Spot-check catalogue coverage:** 20 recent KU and indie romantasy titles in Hardcover against Open Library against our catalogue.
4. Connect an SEO data source to fill the traffic and backlink fields.

---

## Raw Data Sources

All pulled 27 Oct 2026, in `competitor-profiles/raw/hardcover/2026-10-27/`:
- **scrapes/**: homepage, pricing, features, about, faq, changelog (Feb–Oct 2026 reports), blog index, metrics-timeline, income, api, apps, press, roadmap, goodreads-vs-hardcover, integrations-showcase, librarians, book-page-and-seo, similarweb. hardcover.app returned 403 to fetch tools, so the pages were read in a browser.
- **reviews/**: app-store (US/GB/CA), google-play, product-hunt, hacker-news, articles (roadmap threads, Book Riot, SlashGear, blogs, competitor-authored pages marked as biased), reddit (access-failure log), **reddit-via-chatgpt** (ChatGPT web-search report pasted by Makin, 14 threads, unverified). Also **scrapes/roadmap-buddy-reads.md** (fetched with WebFetch, cross-checks ChatGPT's roadmap quotes).
- **SEO:** not pulled; no tool available.
- **Not reachable by Claude:** Reddit (blocked in every tool, including both browsers), Discord, YouTube (tool out of credits), Trustpilot (no page).
- **Unresolved inconsistencies:** team size (10 / 15 / 26 volunteers across pages); API limit (60/min in docs vs 60/s in the Aug blog); store rating differs between Play pages; the income page has no 2026 data.
