import { UTApi } from "uploadthing/server";

// Kept free of "@/" imports so scripts/migrate-covers.ts can load it with plain Node.

const OPEN_LIBRARY_COVER_PREFIX = "https://covers.openlibrary.org/";
const DOWNLOAD_TIMEOUT_MS = 5000;
// uploadFiles waits on UploadThing marking the file done (4-11s in testing). A timed-out upload can still
// land, leaving an unused file in storage, so this is generous rather than tight.
const UPLOAD_TIMEOUT_MS = 15000;
// Open Library answers unknown cover ids with a 1x1 blank gif; storing that would replace the title tile with nothing.
const MIN_COVER_BYTES = 1000;

export function isOpenLibraryCoverUrl(url?: string | null): url is string {
  return !!url && url.startsWith(OPEN_LIBRARY_COVER_PREFIX);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let utapi: UTApi | undefined;

export async function downloadCover(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`cover download failed with ${res.status}`);
  const type = res.headers.get("content-type") || "image/jpeg";
  if (!type.startsWith("image/")) throw new Error(`cover download returned ${type}`);
  const bytes = await withTimeout(res.arrayBuffer(), DOWNLOAD_TIMEOUT_MS, "cover download");
  if (bytes.byteLength < MIN_COVER_BYTES) throw new Error("Open Library has no cover for this id");

  const name = url.slice(OPEN_LIBRARY_COVER_PREFIX.length).replace(/[^a-z0-9.-]+/gi, "-");
  return new File([bytes], name, { type });
}

// Copies an Open Library cover into UploadThing and returns its utfs.io URL.
// Throws on any failure; callers decide what to fall back to.
export async function copyCoverToUploadThing(url: string) {
  const file = await downloadCover(url);
  utapi ??= new UTApi();
  const uploaded = await withTimeout(utapi.uploadFiles(file), UPLOAD_TIMEOUT_MS, "cover upload");
  if (uploaded.error) throw new Error(`cover upload failed: ${uploaded.error.message}`);
  return uploaded.data.url;
}

// Hotlinked Open Library covers all vanish when their cover server is down, so keep our own copy.
// Never throws: adding or editing a book shouldn't fail over a cover, so it falls back to the original URL.
export async function mirrorCover(url: string) {
  if (!isOpenLibraryCoverUrl(url)) return url;
  try {
    return await copyCoverToUploadThing(url);
  } catch (err) {
    console.warn(`Keeping Open Library cover ${url}:`, err instanceof Error ? err.message : err);
    return url;
  }
}
