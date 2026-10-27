import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { getRelation, privacyOf, privacySelect, visibleReview } from "@/lib/privacy";
import { isObjectId } from "@/lib/staffUsers";
import { reviewReportSchema } from "@/lib/reviewReports";
import { alertReport } from "@/lib/reportAlerts";
import { bookHref } from "@/lib/workKey";

const notFound = () => NextResponse.json({ error: "Review not found" }, { status: 404 });

// Reporting someone's review: `bookId` is the reviewer's copy, where the review lives. Like comment
// reports: a fixed reason, one report per reader per review, reviewed by staff on /staff/reports.
// Only a review the reader can see may be reported, so blocks either way, suspensions, private copies and
// private reviews all come back as "not found", and so does your own.
export async function POST(req: Request, { params }: { params: { bookId: string } }) {
  const { user: currentUser, response } = await requireUser("Sign in to report a review.");
  if (response) return response;

  const parsed = reviewReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a reason." }, { status: 400 });

  const limit = rateLimit(`review-report:${currentUser.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  if (!isObjectId(params.bookId)) return notFound();
  const book = await prisma.book.findUnique({
    where: { id: params.bookId },
    select: { id: true, userId: true, title: true, workKey: true, workId: true, isPrivate: true, review: true, reviewSpoiler: true, reviewPrivate: true, reviewHiddenAt: true },
  });
  if (!book || book.userId === currentUser.id || book.isPrivate) return notFound();
  const [owner, relation] = await Promise.all([
    prisma.user.findUnique({ where: { id: book.userId }, select: privacySelect }),
    getRelation(currentUser.id, book.userId),
  ]);
  if (!owner || relation.blocked || !visibleReview(book, relation, privacyOf(owner)).review) return notFound();

  // Reporting twice is a no-op rather than an error: the reader's intent is already recorded, and staff
  // were told the first time.
  try {
    await prisma.reviewReport.create({
      data: { bookId: book.id, reviewerId: book.userId, reporterId: currentUser.id, reason: parsed.data.reason, note: parsed.data.note || null, excerpt: book.review, status: "OPEN" },
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    return NextResponse.json({ reported: true });
  }
  const href = bookHref({ workKey: book.workKey, pageWorkId: book.workId, title: book.title });
  await alertReport({
    kind: "review",
    id: book.id,
    reason: parsed.data.reason,
    reporterId: currentUser.id,
    authorId: book.userId,
    excerpt: book.review,
    path: href ? `${href}#reviews-heading` : "/staff/reports",
  });
  return NextResponse.json({ reported: true });
}
