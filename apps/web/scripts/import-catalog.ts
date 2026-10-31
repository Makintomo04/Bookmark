// Fills the shared catalog (Work and Edition) with the most-read books in a set of Open Library
// subjects, so Ask the shelf has books to find beyond the ones readers have already shelved. No users,
// tags or shelves: catalog rows only, which hold no per-reader data.
//
//   node --env-file=.env.local scripts/import-catalog.ts --dry-run            # what would be added, save nothing
//   node --env-file=.env.local scripts/import-catalog.ts                      # import the default subjects
//   node --env-file=.env.local scripts/import-catalog.ts --limit 50           # at most 50 works per subject
//   node --env-file=.env.local scripts/import-catalog.ts --subjects romance:300,horror
//   node --env-file=.env.local scripts/import-catalog.ts --no-describe        # skip the per-work description requests
//
// Against another database, set DATABASE_URL first (it wins over --env-file). The first line printed
// names the database, so check it before letting a real run go on.
//   bash:        DATABASE_URL="mongodb+srv://…/bookmark" node --env-file=.env.local scripts/import-catalog.ts --dry-run
//   PowerShell:  $env:DATABASE_URL = "mongodb+srv://…/bookmark"
//                node --env-file=.env.local scripts/import-catalog.ts --dry-run
//                Remove-Item Env:DATABASE_URL    # afterwards, so later commands don't hit that database
//
// Rows go through lib/catalog/resolve.ts, the same find-or-create the app uses, so they're keyed and
// shaped exactly like a book a reader added (ol:<work key>, one generic edition carrying the page
// count). Safe to re-run: works are found by key, never duplicated, and an existing row is only ever
// filled in (a missing description, cover or subjects), never overwritten.
//
// Each subject is read from Open Library's search sorted by reading-log count (the same ranking as
// Discover's genre shelves), English only, skipping books with no cover or author. Descriptions matter
// most for search (tropes like "enemies to lovers" live in blurbs, not subject headings) and cost one
// request per work: a full default run is a few thousand requests, about 20 to 30 minutes.
import { PrismaClient } from "@prisma/client";
import { cleanDescription, coverUrlFor, DESCRIPTION_MAX } from "../lib/openLibrary.ts";
import { normaliseWorkKey } from "../lib/workKey.ts";
import { resolveMany, type CatalogInput, type CatalogLookup, type WorkFacts, type WorkRecord } from "../lib/catalog/resolve.ts";
import { scriptCatalogStore } from "./catalog-store.ts";
import { firstReleaseDate } from "@bookmark/shared/releases";

// Open Library subject keys, with how many of the most-read works to take from each. Overlap between
// subjects is expected (a romantasy is also fantasy fiction); each work is imported once.
const SUBJECTS: Record<string, number> = {
  // Romantasy and romance
  fiction_romance_fantasy: 400,
  romantasy: 150,
  fantasy_romance: 150,
  paranormal_romance: 200,
  contemporary_romance: 400,
  romance: 400,
  love_stories: 200,
  romantic_suspense: 150,
  // Fantasy
  fantasy_fiction: 400,
  fantasy: 300,
  magic: 150,
  dragons: 100,
  witches: 100,
  fairies: 100,
  // Elsewhere on the shelf
  science_fiction: 300,
  mystery_and_detective_stories: 300,
  thrillers: 200,
  suspense: 150,
  horror: 200,
  historical_fiction: 300,
  young_adult_fiction: 300,
  literary_fiction: 150,
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = flag("--dry-run");
const describe = !flag("--no-describe");
const limit = value("--limit") ? Number(value("--limit")) : undefined;

// "--subjects romance:300,horror": the given subjects instead of the defaults; a bare name takes 200.
function subjectList(): [string, number][] {
  const raw = value("--subjects");
  const list: [string, number][] = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
        const [name, n] = s.split(":");
        return [name.toLowerCase(), Number(n) || 200];
      })
    : Object.entries(SUBJECTS);
  return list.map(([name, n]) => [name, limit ? Math.min(n, limit) : n]);
}

const prisma = new PrismaClient();
const store = scriptCatalogStore(prisma);

// ---- Open Library ------------------------------------------------------------------------------

// Open Library asks bulk clients to identify themselves and keep to a few requests a second.
const USER_AGENT = "Bookmark catalog import";
const PAGE_SIZE = 100;
const SEARCH_FIELDS = "key,title,author_name,author_key,cover_i,first_publish_year,publish_date,subject,number_of_pages_median";
// Description requests in flight at once, and the pause each takes after its request.
const DESCRIBE_CONCURRENCY = 3;
const DESCRIBE_GAP_MS = 300;
// Works resolved per batch (a handful of database round trips each).
const BATCH = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET a JSON URL, retrying rate limits and server errors with a growing pause. null on a 404.
async function getJson(url: string, attempts = 4): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 404) return null;
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
      if (attempt >= attempts) throw new Error(`HTTP ${res.status} after ${attempts} tries`);
    } catch (err) {
      if (attempt >= attempts) throw err;
    }
    await sleep(2000 * attempt);
  }
}

interface SearchDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  author_key?: string[];
  cover_i?: number;
  first_publish_year?: number;
  // Every edition's publish date, as typed ("March 4, 2014", "2014"): the earliest full one in the first
  // year is when the book came out.
  publish_date?: string[];
  subject?: string[];
  number_of_pages_median?: number;
}

// The most-read works in one subject, as catalog facts.
async function subjectWorks(subject: string, want: number): Promise<WorkFacts[]> {
  const out: WorkFacts[] = [];
  const q = `subject_key:"${subject}" language:eng`;
  for (let offset = 0; out.length < want; offset += PAGE_SIZE) {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&sort=readinglog&fields=${SEARCH_FIELDS}&limit=${PAGE_SIZE}&offset=${offset}`;
    const docs = ((await getJson(url))?.docs ?? []) as SearchDoc[];
    for (const doc of docs) {
      const workKey = normaliseWorkKey(doc.key);
      if (!workKey || !doc.title || !doc.author_name?.length || !doc.cover_i) continue;
      out.push({
        workKey,
        title: doc.title,
        authors: doc.author_name.slice(0, 3),
        authorKeys: (doc.author_key ?? []).slice(0, 3).map((k) => k.replace(/^\/authors\//, "")),
        coverUrl: coverUrlFor(doc.cover_i),
        year: doc.first_publish_year || null,
        releaseDate: firstReleaseDate(doc.publish_date ?? [], doc.first_publish_year),
        subjects: doc.subject ?? [],
        pages: doc.number_of_pages_median || null,
      });
      if (out.length >= want) break;
    }
    if (docs.length < PAGE_SIZE) break;
    await sleep(500);
  }
  return out;
}

async function description(workKey: string): Promise<string | null> {
  const data = await getJson(`https://openlibrary.org/works/${workKey}.json`).catch(() => null);
  await sleep(DESCRIBE_GAP_MS);
  const raw = typeof data?.description === "string" ? data.description : data?.description?.value;
  return typeof raw === "string" ? cleanDescription(raw)?.slice(0, DESCRIPTION_MAX) ?? null : null;
}

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

// ---- Import ------------------------------------------------------------------------------------

const databaseName = () => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "") || "(default)";
  } catch {
    return "(unknown)";
  }
};

async function main() {
  const subjects = subjectList();
  // Reach the database before minutes of Open Library requests, and show what's there, so a wrong
  // connection string fails straight away and the right one is easy to recognise.
  let before: number;
  try {
    before = await prisma.work.count();
  } catch (err) {
    console.error(`can't reach database "${databaseName()}". Check DATABASE_URL (user, password, database name).\n`);
    throw err;
  }
  console.log(`database: ${databaseName()}, ${before} works in the catalog${dryRun ? " (dry run, nothing is saved)" : ""}${describe ? "" : " (no descriptions)"}`);

  // 1. The works, across subjects, each once.
  const facts = new Map<string, WorkFacts>();
  for (const [subject, want] of subjects) {
    let found: WorkFacts[] = [];
    try {
      found = await subjectWorks(subject, want);
    } catch (err) {
      console.warn(`  ${subject}: search failed (${err instanceof Error ? err.message : err}), skipped`);
      continue;
    }
    const fresh = found.filter((f) => !facts.has(f.workKey));
    fresh.forEach((f) => facts.set(f.workKey, f));
    console.log(`  ${subject}: ${found.length} works, ${fresh.length} not seen in an earlier subject`);
  }

  const keys = Array.from(facts.keys());
  const existing = new Map<string, WorkRecord>();
  for (let n = 0; n < keys.length; n += 500) {
    for (const w of await store.findWorks(keys.slice(n, n + 500).map((k) => `ol:${k}`))) existing.set(w.openLibraryKey ?? w.key.slice(3), w);
  }
  const toAdd = keys.filter((k) => !existing.has(k));
  // Works already in the catalog with no description yet: worth one request each too.
  const toDescribe = new Set(keys.filter((k) => !existing.get(k)?.description));
  console.log(`\n${keys.length} works: ${toAdd.length} new, ${keys.length - toAdd.length} already in the catalog`);
  if (dryRun) {
    console.log(`would add ${toAdd.length} works${describe ? ` and fetch ${toDescribe.size} descriptions` : ""}`);
    return;
  }

  // 2. Resolve in batches: the facts above stand in for the resolver's Open Library lookup, so the only
  // requests left are descriptions.
  const lookup: CatalogLookup = {
    async works(workKeys) {
      return new Map(workKeys.flatMap((k) => (facts.has(k) ? [[k, facts.get(k)!] as const] : [])));
    },
    async work() {
      return null; // descriptions are fetched below, before each batch
    },
    async isbn() {
      return null;
    },
    async title() {
      return null;
    },
  };

  let added = 0;
  let described = 0;
  let failed = 0;
  for (let n = 0; n < keys.length; n += BATCH) {
    const chunk = keys.slice(n, n + BATCH);
    const descriptions = new Map<string, string>();
    if (describe) {
      await pool(chunk.filter((k) => toDescribe.has(k)), DESCRIBE_CONCURRENCY, async (k) => {
        const text = await description(k);
        if (text) descriptions.set(k, text);
      });
    }
    const inputs: CatalogInput[] = chunk.map((k) => {
      const f = facts.get(k)!;
      return {
        workKey: k,
        title: f.title!,
        authors: f.authors,
        authorKeys: f.authorKeys,
        subjects: f.subjects,
        coverUrl: f.coverUrl,
        year: f.year,
        releaseDate: f.releaseDate ?? null,
        pages: f.pages,
        description: descriptions.get(k) ?? null,
      };
    });
    try {
      await resolveMany(inputs, { store, lookup, concurrency: 1 });
      added += chunk.filter((k) => !existing.has(k)).length;
      described += descriptions.size;
    } catch (err) {
      failed += chunk.length;
      console.warn(`  batch ${n / BATCH + 1} failed: ${err instanceof Error ? err.message : err}`);
    }
    console.log(`  ${Math.min(n + BATCH, keys.length)}/${keys.length}: ${added} added, ${described} descriptions`);
  }

  console.log(`\ndone: ${added} works added, ${described} descriptions saved, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
