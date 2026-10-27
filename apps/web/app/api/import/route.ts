import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { ImportFormatError } from "@/lib/import/formats";
import { ListInputError } from "@/lib/import/text";
import { ImportInputError, MAX_FILE_BYTES, createJob, createListJob, latestJob, viewJob } from "@/lib/import/job";

export const dynamic = "force-dynamic";
// A pasted list is read by the model during the upload (lib/import/text.ts): up to 25 requests side by side.
export const maxDuration = 60;

// A pasted list's limit: 2,000 lines of a sensible length is well under this.
const MAX_LIST_BYTES = 512 * 1024;

// GET /api/import: the reader's current (or just-finished) import, so a reload picks up where it was.
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  const job = await latestJob(user.id);
  return NextResponse.json(job ? await viewJob(job) : null, { headers: { "Cache-Control": "no-store" } });
}

const uploadSchema = z.object({
  file: z
    .instanceof(Blob, { message: "Choose a CSV file to upload." })
    .refine((f) => f.size > 0, "That file is empty.")
    .refine((f) => f.size <= MAX_FILE_BYTES, "That file is over 5 MB. Export just your books (CSV), not a full data archive."),
});

const listSchema = z.object({
  text: z
    .string({ required_error: "Paste your list first.", invalid_type_error: "Paste your list first." })
    .refine((t) => t.trim().length > 0, "Paste your list first.")
    .refine((t) => new TextEncoder().encode(t).length <= MAX_LIST_BYTES, "That list is too long for one import. Split it in two."),
  // The shelf for books the list doesn't put on one.
  defaultStatus: z.enum(["NOT_STARTED", "COMPLETED"]).default("NOT_STARTED"),
  // The reader ticked "Use AI to pick out the books". Off: the rules alone read the list.
  useAi: z.boolean().default(false),
  // A .txt or .md file the page read for the reader, if that's where the list came from.
  fileName: z.string().max(200).nullish(),
});

// UTF-8 (BOM or not), or UTF-16 with a BOM, which is what Excel writes when a CSV is saved as "Unicode text".
function decodeCsv(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buffer);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buffer);
  return new TextDecoder("utf-8").decode(buffer);
}

// POST /api/import: creates the job. Nothing is added to the shelf until the reader confirms the preview.
//   - multipart, field "file": a Goodreads, StoryGraph or Bookmark CSV.
//   - JSON { text, defaultStatus?, useAi?, fileName? }: a pasted list. Free, like every import.
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const limit = rateLimit(`import-upload:${user.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You've uploaded a lot of files in the last hour. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Refuse an oversized body before reading it, where the client says how big it is.
  const declared = Number(req.headers.get("content-length"));
  if (declared > MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "That file is over 5 MB." }, { status: 413 });
  }

  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const list = listSchema.safeParse(await req.json().catch(() => null));
      if (!list.success) {
        return NextResponse.json({ error: list.error.issues[0]?.message ?? "Paste your list first." }, { status: 400 });
      }
      const job = await createListJob(user.id, list.data.text, {
        fileName: list.data.fileName?.slice(0, 200) ?? null,
        defaultStatus: list.data.defaultStatus,
        useAi: list.data.useAi,
      });
      return NextResponse.json(await viewJob(job), { status: 201 });
    }

    const form = await req.formData().catch(() => null);
    const parsed = uploadSchema.safeParse({ file: form?.get("file") });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose a CSV file to upload." }, { status: 400 });
    }
    const file = parsed.data.file;
    const fileName = file instanceof File ? file.name.slice(0, 200) : null;
    const text = decodeCsv(await file.arrayBuffer());
    const job = await createJob(user.id, text, fileName);
    return NextResponse.json(await viewJob(job), { status: 201 });
  } catch (err) {
    if (err instanceof ImportFormatError || err instanceof ImportInputError || err instanceof ListInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
