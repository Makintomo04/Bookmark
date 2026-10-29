import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { reportBook } from "@/lib/staffReports";
import { jsonBody, staffAnswer, staffFail } from "@/lib/staffRoute";
import { notifyStaffOfReport } from "@/lib/staffNotify";

// "Report a problem" on a book: a wrong cover or wrong details, for a librarian to fix in the shared
// catalogue, or a request to add a book that has no page yet ("catalogue"). Body: { workId or workKey,
// editionId?, reason: "cover" | "details" | "other" | "catalogue", note? }.
export async function POST(req: Request) {
  const { user, response } = await requireUser("Sign in to report a problem with a book.");
  if (response) return response;
  const limit = rateLimit(`book-report:${user.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return staffAnswer(staffFail(429, tooManyRequestsMessage));
  const result = await reportBook(user.id, await jsonBody(req));
  // Staff hear it's waiting. Awaited, so a serverless host doesn't cut it off; it never fails the report.
  // The reader's newest report is this one.
  if (result.ok) {
    await prisma.bookReport.findFirst({ where: { reporterId: user.id }, orderBy: { createdAt: "desc" }, select: { workId: true } })
      .then((report) => report && notifyStaffOfReport("book", report.workId))
      .catch((err) => console.error("[staffNotify] couldn't find the book report:", err));
  }
  return staffAnswer(result);
}
