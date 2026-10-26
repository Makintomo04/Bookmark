import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { bookPageData } from "@/lib/bookPage";
import { bookReportSchema, issueLabel } from "@/lib/bookReportRules";
import { rateLimit } from "@/lib/rateLimit";
import { alertReport } from "@/lib/reportAlerts";
import { bookHref, normaliseWorkKey } from "@/lib/workKey";

// A reader reporting missing or incorrect details on a book page. Saved, and emailed to staff with
// the details as the page showed them, so a later fix doesn't hide what was reported.
//
//   POST /api/books/report { workKey, issues: ["cover", "pages"], note? }

// Plenty for a reader correcting a shelf's worth of books; a ceiling on scripted floods.
const REPORTS_PER_HOUR = 20;

export async function POST(req: Request) {
  const { user, response } = await requireUser("Sign in to report a problem with this book.");
  if (response) return response;

  const parsed = bookReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid report" }, { status: 400 });
  const workKey = normaliseWorkKey(parsed.data.workKey);
  if (!workKey) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const limit = rateLimit(`book-report:${user.id}`, REPORTS_PER_HOUR, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "You've sent a lot of reports. Try again in a while." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const data = await bookPageData(workKey);
  if (!data) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  const { issues, note } = parsed.data;

  const report = await prisma.bookReport.create({ data: { workKey, reporterId: user.id, issues, note } });

  const { book, series } = data;
  await alertReport({
    kind: "book",
    id: report.id,
    reason: issues.map(issueLabel).join(", "),
    reporterId: user.id,
    excerpt: [
      note && `Reader's note: ${note}`,
      `Title: ${book.title}`,
      `Author: ${book.author}`,
      series && `Series: ${series.name}${series.position != null ? ` #${series.position}` : ""}`,
      `First published: ${book.year ?? "unknown"}`,
      `Pages: ${book.pages ?? "unknown"}`,
      `Cover: ${book.coverUrl ?? "none"}`,
      `Open Library: https://openlibrary.org/works/${workKey}`,
      data.description && `Description: ${data.description}`,
    ].filter(Boolean).join("\n"),
    path: bookHref({ workKey, title: book.title })!,
  });

  return NextResponse.json({ reported: true });
}
