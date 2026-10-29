import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { copyCoverWithKey, CoverLinkError } from "@/lib/covers";
import { recordUpload } from "@/lib/uploads";

// Up to four 5s fetches (redirects) and a 15s upload (lib/covers.ts timeouts).
export const maxDuration = 45;

// "Paste an image link" for a book's cover: the image is copied to our own storage (book pages only load
// images from the hosts in next.config.mjs) and recorded as the reader's upload, so like a photo they
// picked it stays on their own copy (lib/uploads.ts). lib/covers.ts downloadCover refuses private addresses.
// Body: { url }.
export async function POST(req: Request) {
  const { user, response } = await requireUser("Sign in to add a cover.");
  if (response) return response;
  const limit = rateLimit(`cover-link:${user.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || url.length > 2048) return NextResponse.json({ error: "Paste the image's address." }, { status: 400 });
  try {
    const copy = await copyCoverWithKey(url);
    await recordUpload({ key: copy.key, url: copy.url, userId: user.id, kind: "cover" });
    return NextResponse.json({ url: copy.url });
  } catch (err) {
    if (err instanceof CoverLinkError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.warn(`Couldn't copy cover link ${url}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't fetch an image from that link. Use the image's own address (right-click the cover, Copy image address)." }, { status: 400 });
  }
}
