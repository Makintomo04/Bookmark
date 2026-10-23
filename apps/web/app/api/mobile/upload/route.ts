import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { uploadImage } from "@/lib/covers";
import { UPLOAD_KINDS, recordUpload, type UploadKind } from "@/lib/uploads";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";

// Image uploads from the mobile app: profile pictures and book covers. The web uploads straight to
// UploadThing from the browser (app/api/uploadthing); the app sends the image here instead, as
// multipart form data under "file", and gets back the utfs.io URL to save on the profile or book. Same
// limits as the web's uploader: an image, 4MB at most. The app shrinks photos before sending. An optional
// "kind" field (avatar, banner, cover) is kept on the Upload record (lib/uploads.ts).
export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const limit = rateLimit(`mobile-upload:${user.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ error: "That file isn't a photo we can use. Try a JPEG or PNG." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 4MB. Try a smaller one." }, { status: 413 });

  const asked = form?.get("kind");
  const kind = UPLOAD_KINDS.includes(asked as UploadKind) ? (asked as UploadKind) : "image";
  try {
    const { url, key } = await uploadImage(file);
    await recordUpload({ key, url, userId: user.id, kind });
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[mobile-upload]", error);
    return NextResponse.json({ error: "Couldn't upload the image. Try again." }, { status: 502 });
  }
}
