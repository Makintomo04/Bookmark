import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { cancelJob, coversStep, decideStep, findJob, importStep, matchStep, resolveUnmatched, startImport, viewJob } from "@/lib/import/job";
import type { Decision } from "@/lib/import/review";

export const dynamic = "force-dynamic";
// Steps stop starting new work after ~12s; covers can take ~20s each (in parallel). Well under this.
export const maxDuration = 60;

type Params = { params: Promise<{ jobId: string }> };

const notFound = () => NextResponse.json({ error: "That import doesn't exist." }, { status: 404 });

export async function GET(_req: Request, props: Params) {
  const params = await props.params;
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
  // Before the import: the reader's call on a match the matcher wasn't sure of.
  z.object({
    action: z.literal("decide"),
    index: z.number().int().min(0).max(100_000),
    choice: z.enum(["accept", "typed", "pick"]),
    candidate: z
      .object({
        workKey: z.string().regex(/OL\d+W/).max(40),
        title: z.string().max(500).nullish(),
        authors: z.array(z.string().max(200)).max(10).nullish(),
        year: z.number().int().min(0).max(3000).nullish(),
        coverUrl: z.string().url().max(300).nullish(),
        pages: z.number().int().min(1).max(100_000).nullish(),
        subjects: z.array(z.string().max(200)).max(30).nullish(),
      })
      .nullish(),
  }),
]);

// POST /api/import/:jobId { action }: runs one bounded step and returns the job's new view.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
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
    case "decide": {
      let decision: Decision;
      if (body.choice === "pick") {
        const c = body.candidate;
        if (!c) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
        const workKey = c.workKey.match(/OL\d+W/)![0];
        decision = {
          choice: "pick",
          candidate: { workKey, title: c.title ?? null, authors: c.authors ?? [], year: c.year ?? null, coverUrl: c.coverUrl ?? null, pages: c.pages ?? null, subjects: c.subjects ?? [] },
        };
      } else {
        decision = { choice: body.choice };
      }
      const outcome = await decideStep(job, body.index, decision);
      if (outcome.error) return NextResponse.json({ error: outcome.error }, { status: 409 });
      job = outcome.job;
      break;
    }
  }
  return NextResponse.json(await viewJob(job));
}

// DELETE /api/import/:jobId: abandons an import before it starts. Nothing was added to the shelf.
export async function DELETE(_req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requireUser();
  if (response) return response;
  const job = await findJob(user.id, params.jobId);
  if (!job) return notFound();
  if (job.status === "importing") return NextResponse.json({ error: "This import is already running." }, { status: 409 });
  return NextResponse.json(await viewJob(await cancelJob(job)));
}
