import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { cancelJob, coversStep, findJob, importStep, matchStep, resolveUnmatched, startImport, viewJob } from "@/lib/import/job";

export const dynamic = "force-dynamic";
// Steps stop starting new work after ~12s; covers can take ~20s each (in parallel). Well under this.
export const maxDuration = 60;

type Params = { params: { jobId: string } };

const notFound = () => NextResponse.json({ error: "That import doesn't exist." }, { status: 404 });

export async function GET(_req: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (response) return response;
  const job = await findJob(user.id, params.jobId);
  if (!job) return notFound();
  return NextResponse.json(await viewJob(job), { headers: { "Cache-Control": "no-store" } });
}

const actionSchema = z.discriminatedUnion("action", [
  // Look up the next batch of rows on Open Library.
  z.object({ action: z.literal("match") }),
  // The reader confirmed the preview.
  z.object({ action: z.literal("start") }),
  // Insert the next batch of books.
  z.object({ action: z.literal("import") }),
  // Copy a few hotlinked covers into UploadThing.
  z.object({ action: z.literal("covers") }),
  // Point an unmatched book at an Open Library work, or keep it as a manual entry.
  z.object({
    action: z.literal("fix"),
    bookId: z.string().regex(/^[a-f0-9]{24}$/),
    workKey: z.string().regex(/OL\d+W/).max(40),
    coverUrl: z.string().url().max(300).nullish(),
    pages: z.number().int().min(1).max(100_000).nullish(),
  }),
  z.object({ action: z.literal("keep"), bookId: z.string().regex(/^[a-f0-9]{24}$/) }),
]);

// POST /api/import/:jobId { action }: runs one bounded step and returns the job's new view.
export async function POST(req: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (response) return response;

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = parsed.data;

  // The page polls one step at a time; a 2,000-book import takes a few dozen. This only stops a runaway loop.
  const limit = rateLimit(`import-step:${user.id}`, 600, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Give it a minute, then carry on." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let job = await findJob(user.id, params.jobId);
  if (!job) return notFound();

  switch (body.action) {
    case "match":
      job = await matchStep(job);
      break;
    case "start":
      if (job.status !== "ready") return NextResponse.json({ error: "This import isn't ready to start." }, { status: 409 });
      job = await startImport(job);
      break;
    case "import":
      job = await importStep(job);
      break;
    case "covers":
      await coversStep(job);
      job = (await findJob(user.id, params.jobId)) ?? job;
      break;
    case "fix":
    case "keep": {
      if (job.status !== "done") return NextResponse.json({ error: "Finish the import first." }, { status: 409 });
      const outcome = await resolveUnmatched(job, body.action === "keep" ? { bookId: body.bookId, keep: true } : body);
      if (outcome.error) return NextResponse.json({ error: outcome.error }, { status: 409 });
      job = outcome.job;
      break;
    }
  }
  return NextResponse.json(await viewJob(job));
}

// DELETE /api/import/:jobId: abandons an import before it starts. Nothing was added to the shelf.
export async function DELETE(_req: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (response) return response;
  const job = await findJob(user.id, params.jobId);
  if (!job) return notFound();
  if (job.status === "importing") return NextResponse.json({ error: "This import is already running." }, { status: 409 });
  return NextResponse.json(await viewJob(await cancelJob(job)));
}
