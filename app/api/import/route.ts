import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { ImportFormatError } from "@/lib/import/formats";
import { ImportInputError, MAX_FILE_BYTES, createJob, latestJob, viewJob } from "@/lib/import/job";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

// POST /api/import (multipart, field "file"): parses the CSV and creates the job. Nothing is added to the
// shelf until the reader confirms the preview.
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

  const form = await req.formData().catch(() => null);
  const parsed = uploadSchema.safeParse({ file: form?.get("file") });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose a CSV file to upload." }, { status: 400 });
  }
  const file = parsed.data.file;
  const fileName = file instanceof File ? file.name.slice(0, 200) : null;

  try {
    const text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
    const job = await createJob(user.id, text, fileName);
    return NextResponse.json(await viewJob(job), { status: 201 });
  } catch (err) {
    if (err instanceof ImportFormatError || err instanceof ImportInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
