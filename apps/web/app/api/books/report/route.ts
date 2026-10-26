import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { reportBook } from "@/lib/staffReports";
import { jsonBody, staffAnswer, staffFail } from "@/lib/staffRoute";

// "Report a problem" on a book: a wrong cover or wrong details, for a librarian to fix in the shared
// catalogue. Body: { workId or workKey, editionId?, reason: "cover" | "details" | "other", note? }.
export async function POST(req: Request) {
  const { user, response } = await requireUser("Sign in to report a problem with a book.");
  if (response) return response;
  const limit = rateLimit(`book-report:${user.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return staffAnswer(staffFail(429, tooManyRequestsMessage));
  return staffAnswer(await reportBook(user.id, await jsonBody(req)));
}
