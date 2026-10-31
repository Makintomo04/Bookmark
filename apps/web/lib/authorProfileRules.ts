// A librarian's bio and photo for an author page, apart from the database so
// scripts/test/authorProfile.test.ts runs under plain Node. lib/authorProfile.ts saves them.

export const BIO_MAX = 4000;

export interface ProfileValues {
  bio: string | null;
  photoUrl: string | null;
}

type Parsed = { ok: true; patch: Partial<ProfileValues> } | { ok: false; error: string };

// A bio as the author page shows it: paragraphs split on blank lines.
export const bioParagraphs = (bio: string): string[] =>
  bio.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);

const isHttps = (url: string) => {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

// Only the fields sent are changed; an empty one clears it, so the page falls back to Open Library's.
export function parseProfileFix(body: Record<string, unknown>): Parsed {
  const patch: Partial<ProfileValues> = {};
  if ("bio" in body) {
    const bio = typeof body.bio === "string" ? bioParagraphs(body.bio).join("\n\n") : "";
    if (bio.length > BIO_MAX) return { ok: false, error: `Keep the bio under ${BIO_MAX} characters.` };
    patch.bio = bio || null;
  }
  if ("photoUrl" in body) {
    const raw = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";
    if (raw && !isHttps(raw)) return { ok: false, error: "The photo needs to be an https image link." };
    patch.photoUrl = raw || null;
  }
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to change." };
  return { ok: true, patch };
}
