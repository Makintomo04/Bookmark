import { isOpenLibraryCopyName, uploadThingKey } from "./uploadedImages.ts";

// The one-off clean-up behind uploads staying private (scripts/private-covers.ts). Before the Upload
// model, a reader's uploaded cover could spread to the catalogue, search, circles, lists and other
// readers' shelves. This works out, from a snapshot of the data, which files are readers' uploads and
// what to change so each stays only on its uploader's own copy. Pure, so scripts/test/coverCleanup.test.ts
// can check every rule; the script gathers the snapshot and applies the plan.
//
// Which files are uploads: those with an Upload row, and older ones whose stored name isn't one of our
// Open Library copies' (lib/uploadedImages.ts isOpenLibraryCopyName). A file whose name couldn't be read
// is left alone and reported.

export interface CleanupSnapshot {
  // Every UploadThing file the data points at, by key: its stored name, or null when it couldn't be read.
  fileNames: Map<string, string | null>;
  // Existing Upload rows: key → uploader.
  uploads: Map<string, string>;
  users: { id: string; image: string | null; banner: string | null }[];
  books: { id: string; userId: string; coverImage: string; editionId: string | null; workId: string | null; workKey: string | null; createdAt: Date }[];
  editions: { id: string; workId: string; coverUrl: string | null }[];
  works: { id: string; openLibraryKey: string | null; coverUrl: string | null }[];
  listItems: { id: string; ownerId: string; workKey: string | null; coverUrl: string | null }[];
  circles: { id: string; hostId: string; workKey: string | null; coverImage: string | null }[];
}

export interface CleanupPlan {
  // Uploads from before the Upload model, now recorded against whoever uploaded them.
  record: { key: string; url: string; userId: string; kind: "avatar" | "banner" | "cover" | "image" }[];
  editions: { id: string; coverUrl: null }[];
  works: { id: string; coverUrl: null }[];
  circles: { id: string; coverImage: string | null }[];
  listItems: { id: string; coverUrl: string | null }[];
  // Other readers' copies that took someone's upload: the catalogue's cover, or the title card ("").
  books: { id: string; coverImage: string }[];
  // Uploads found only in shared places, so nobody to record them against. Still taken out of those places.
  ownerUnknown: string[];
  // Files whose names couldn't be read (gone, or the request failed). Left as they are.
  unreadable: string[];
}

export function planCoverCleanup(s: CleanupSnapshot): CleanupPlan {
  const plan: CleanupPlan = { record: [], editions: [], works: [], circles: [], listItems: [], books: [], ownerUnknown: [], unreadable: [] };
  const keyOf = (url: string | null | undefined) => uploadThingKey(url);

  // Which keys are uploads, and who uploaded them.
  const uploader = new Map(s.uploads);
  const isUpload = (key: string) => {
    if (uploader.has(key)) return true;
    const name = s.fileNames.get(key);
    return name !== undefined && name !== null && !isOpenLibraryCopyName(name);
  };
  const legacy = new Set<string>();
  for (const [key, name] of Array.from(s.fileNames)) {
    if (uploader.has(key)) continue;
    if (name === null) plan.unreadable.push(key);
    else if (!isOpenLibraryCopyName(name)) legacy.add(key);
  }

  // Owners for older uploads: the profile it's on; else the earliest shelf copy carrying it (later copies
  // took it from there); else the list's owner or the circle's host. Otherwise unknown.
  const urlOf = new Map<string, string>();
  const claim = (key: string, userId: string, kind: CleanupPlan["record"][number]["kind"]) => {
    if (uploader.has(key) || !legacy.has(key)) return;
    uploader.set(key, userId);
    plan.record.push({ key, url: urlOf.get(key)!, userId, kind });
  };
  const seen = (url: string | null | undefined) => {
    const key = keyOf(url);
    if (key && url && !urlOf.has(key)) urlOf.set(key, url);
    return key;
  };
  for (const u of s.users) {
    const avatar = seen(u.image);
    if (avatar) claim(avatar, u.id, "avatar");
    const banner = seen(u.banner);
    if (banner) claim(banner, u.id, "banner");
  }
  for (const b of [...s.books].sort((a, b) => +a.createdAt - +b.createdAt)) {
    const key = seen(b.coverImage);
    if (key) claim(key, b.userId, "cover");
  }
  for (const i of s.listItems) {
    const key = seen(i.coverUrl);
    if (key) claim(key, i.ownerId, "cover");
  }
  for (const c of s.circles) {
    const key = seen(c.coverImage);
    if (key) claim(key, c.hostId, "cover");
  }
  for (const e of s.editions) seen(e.coverUrl);
  for (const w of s.works) seen(w.coverUrl);
  plan.ownerUnknown = Array.from(legacy).filter((k) => !uploader.has(k) && urlOf.has(k));

  const shared = (url: string | null | undefined) => {
    const key = keyOf(url);
    return !!url && !(key && isUpload(key));
  };

  // The catalogue gives up every upload.
  const editionCover = new Map<string, string | null>();
  for (const e of s.editions) {
    if (e.coverUrl && !shared(e.coverUrl)) plan.editions.push({ id: e.id, coverUrl: null });
    editionCover.set(e.id, shared(e.coverUrl) ? e.coverUrl : null);
  }
  const workCover = new Map<string, string | null>();
  const workByKey = new Map<string, string | null>();
  for (const w of s.works) {
    if (w.coverUrl && !shared(w.coverUrl)) plan.works.push({ id: w.id, coverUrl: null });
    const cover = shared(w.coverUrl) ? w.coverUrl : null;
    workCover.set(w.id, cover);
    if (w.openLibraryKey) workByKey.set(w.openLibraryKey, cover);
  }
  const catalogue = (b: { editionId?: string | null; workId?: string | null; workKey?: string | null }) =>
    (b.editionId && editionCover.get(b.editionId)) || (b.workId && workCover.get(b.workId)) || (b.workKey && workByKey.get(b.workKey)) || null;

  // Shared places take the catalogue's cover instead, or none.
  for (const c of s.circles) {
    if (c.coverImage && !shared(c.coverImage)) plan.circles.push({ id: c.id, coverImage: catalogue(c) });
  }
  for (const i of s.listItems) {
    if (i.coverUrl && !shared(i.coverUrl)) plan.listItems.push({ id: i.id, coverUrl: catalogue(i) });
  }
  // Shelf copies keep their own reader's uploads; anyone else's goes.
  for (const b of s.books) {
    const key = keyOf(b.coverImage);
    if (!key || !isUpload(key)) continue;
    const owner = uploader.get(key);
    if (owner !== undefined && owner === b.userId) continue;
    plan.books.push({ id: b.id, coverImage: catalogue(b) ?? "" });
  }
  return plan;
}
