import { LEGACY_KEYS, getMilestone } from "./achievements-catalog";

// A shared medal's link: /u/<username>/medals/BOOKS_READ-50. The stored key's colon becomes a dash,
// so the path segment needs no escaping. Web and mobile both build it here.

export const medalSlug = (storedKey: string) => (LEGACY_KEYS[storedKey] ?? storedKey).replace(":", "-");

export const medalSharePath = (username: string, storedKey: string) => `/u/${encodeURIComponent(username)}/medals/${medalSlug(storedKey)}`;

// The rung a slug names, if the reader holds it. Earned rungs may be stored under their old names,
// so both sides are compared as current keys. Anything they haven't earned comes back null.
export function findEarnedMedal<T extends { key: string }>(earned: T[], slug: string) {
  const match = /^([A-Z_]+)-(\d+)$/.exec(slug);
  if (!match) return null;
  const wanted = `${match[1]}:${match[2]}`;
  const found = getMilestone(wanted);
  const record = found && earned.find((e) => (LEGACY_KEYS[e.key] ?? e.key) === wanted);
  return found && record ? { ...found, record } : null;
}
