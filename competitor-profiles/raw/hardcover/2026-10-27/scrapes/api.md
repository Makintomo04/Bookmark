# Hardcover API docs — Getting Started
Source: https://docs.hardcover.app/api/getting-started/
Fetched: 2026-10-27 (in-app browser). Page shows "Last Updated 4 days ago" (~23 Oct 2026).

- Disclaimer: "This API is currently in development and may change or break at any time with out notice." Help via #api Discord channel. Portions auto-generated.
- GraphQL. "The API that you can use is exactly the same API used by the website, iOS and Android apps." "currently in beta".
- API key: Account settings > Hardcover API > New API Key; name, expiration, scopes. Tokens before August 2026 = "all" access. Third parties named as examples: NickelHardcover, Hardcover KOReader Plugin. OAuth recommended for apps; PAT Link Builder.
- Response codes 200/400/401/403 (insufficient_scope, unsupported_operation, request_exceeds_capacity)/404/408/429/500/503.
- Important notes: "You own your data. This means you can't use the API to access and use someone else's data." Actions taken as your user. CORS open. "Never ask a user to paste a PAT into your app." Max timeout 30s; search 2s. **"By using the API, you agree not to use to train large language models that are made publicly available or used commercially."**
- Commercial API Use: "we make no copyright or proprietary rights over this data". Commercial products/public websites may not use user-owned data (libraries, stats, reviews, ratings, dates read, journals, prompts, lists, Vibes, goals, network/activities) unless on behalf of a consenting user. Aggregate data allowed with attribution ("number of Hardcover Readers, average Hardcover rating").
- Public data warning re images & DMCA ("this has happened to us").
- Disabled operators: _like, _nlike, _ilike, _niregex, _nregex, _iregex, _regex, _nsimilar, _similar. "Queries are not allowed to run in the browser" (note: contradicts "CORS is open" — doc inconsistency).
- **Rate limits** (current):
  | Plan | Daily | Burst | Per minute | Intended use |
  | Free | 5,000 | 10 | 60 | Personal ownership, progress sync, personal use, doing cool stuff |
  | Supporter | 50,000 | 15 | 60 | Heavy data needs, always running processes, research |
  Each top-level field = 1 request; aliases count separately; nested free; insert_reading_journal batch exempt. PATs get double burst vs legacy JWT. IETF RateLimit headers + legacy X-RateLimit-*; daily reset midnight UTC.
  Public-good projects can request increases (example: Hardcover bot in r/suggestmeabook). Commercial tier: "We're building that out right now."
  [NB: Aug 2026 blog said "Rate: 60 API requests/second"; docs say 60/minute — docs taken as authoritative.]
- API Roadmap (2026): OAuth for external apps (now shipped per Sep 2026 report); client-side API use; max query depth 3; queries may be limited to own data, public data, and followed users' data.
No text aimed at AI agents observed (the LLM-training clause is a terms term for API users, not an instruction to this agent).
