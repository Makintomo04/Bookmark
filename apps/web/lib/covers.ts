import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { UTApi } from "uploadthing/server";

// Kept free of "@/" imports so scripts/migrate-covers.ts can load it with plain Node.

const OPEN_LIBRARY_COVER_PREFIX = "https://covers.openlibrary.org/";
const DOWNLOAD_TIMEOUT_MS = 5000;
// uploadFiles waits on UploadThing marking the file done (4-11s in testing). A timed-out upload can still
// land, leaving an unused file in storage, so this is generous rather than tight.
const UPLOAD_TIMEOUT_MS = 15000;
// Open Library answers unknown cover ids with a 1x1 blank gif; storing that would replace the title tile with nothing.
const MIN_COVER_BYTES = 1000;
// The same cap as an upload (app/api/uploadthing/core.ts).
export const MAX_COVER_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;

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

// A cover link a reader or librarian pasted makes our server fetch it, so the address must be a public
// one: not loopback, our own network, link-local (cloud metadata lives at 169.254.169.254) or reserved.
export function isPublicAddress(ip: string): boolean {
  const v4 = isIP(ip) === 4 ? ip : ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (v4) {
    const [a, b] = v4.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0))
      || (a === 198 && (b === 18 || b === 19)));
  }
  if (isIP(ip) !== 6) return false;
  const v6 = ip.toLowerCase();
  return !(v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff") || v6.startsWith("::ffff:"));
}

async function assertPublicHttps(url: URL) {
  if (url.protocol !== "https:") throw new CoverLinkError("The link needs to start with https://");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new CoverLinkError("Couldn't find that website. Check the link.");
  if (!addresses.every(isPublicAddress)) throw new CoverLinkError("That link can't be used.");
}

// A problem with the link itself, worded for the person who pasted it.
export class CoverLinkError extends Error {}

// Reads at most MAX_COVER_BYTES, however long the server says the body is (or doesn't say).
async function readCapped(res: Response) {
  const declared = Number(res.headers.get("content-length"));
  if (declared > MAX_COVER_BYTES) throw new CoverLinkError("That image is over 4MB.");
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_COVER_BYTES) {
      await reader.cancel();
      throw new CoverLinkError("That image is over 4MB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return bytes;
}

// Follows redirects itself, checking every hop, so a public link can't bounce the fetch somewhere private.
export async function downloadCover(link: string) {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new CoverLinkError("That isn't a link. Copy the image's address and paste it here.");
  }
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttps(url);
    // Some image hosts (Wikimedia, several shop CDNs) refuse a request that doesn't say who's asking.
    res = await fetch(url, { redirect: "manual", headers: { "user-agent": "Bookmark/1.0 (book cover copy)" }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) break;
    url = new URL(next, url);
    res = null;
  }
  if (!res) throw new CoverLinkError("That link redirects too many times.");
  if (!res.ok) throw new CoverLinkError(`Couldn't fetch that image (the site answered ${res.status}).`);
  const type = res.headers.get("content-type") || "image/jpeg";
  if (!type.startsWith("image/")) throw new CoverLinkError("That link isn't an image. Use the image's own address (right-click the cover, Copy image address).");
  const bytes = await withTimeout(readCapped(res), DOWNLOAD_TIMEOUT_MS, "cover download");
  if (bytes.byteLength < MIN_COVER_BYTES) throw new CoverLinkError("There's no cover at that link.");

  const path = isOpenLibraryCoverUrl(link) ? link.slice(OPEN_LIBRARY_COVER_PREFIX.length) : url.pathname.split("/").pop() || "cover";
  const name = path.replace(/[^a-z0-9.-]+/gi, "-");
  return new File([bytes], name, { type });
}

// Copies a cover (Open Library's, or any https image a librarian picked) into UploadThing and returns its utfs.io URL.
// Throws on any failure; callers decide what to fall back to.
export async function copyCoverToUploadThing(url: string) {
  return (await copyCoverWithKey(url)).url;
}

// The same, with the stored file's key, for recording a reader's pasted cover as their upload (lib/uploads.ts).
export async function copyCoverWithKey(url: string) {
  const file = await downloadCover(url);
  utapi ??= new UTApi();
  const uploaded = await withTimeout(utapi.uploadFiles(file), UPLOAD_TIMEOUT_MS, "cover upload");
  if (uploaded.error) throw new Error(`cover upload failed: ${uploaded.error.message}`);
  return { url: uploaded.data.url, key: uploaded.data.key };
}

// Uploads an image the reader picked (the mobile app's photos and covers, app/api/mobile/upload) and
// returns its utfs.io URL and file key. Throws on any failure.
export async function uploadImage(file: File) {
  utapi ??= new UTApi();
  const uploaded = await withTimeout(utapi.uploadFiles(file), UPLOAD_TIMEOUT_MS, "image upload");
  if (uploaded.error) throw new Error(`image upload failed: ${uploaded.error.message}`);
  return { url: uploaded.data.url, key: uploaded.data.key };
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
