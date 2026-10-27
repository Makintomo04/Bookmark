// Reporting someone's review: the reasons a reader picks from, shared by the web and mobile apps and the
// API (app/api/books/[bookId]/review-report). Staff act on reports from /staff/reports (lib/staffReports.ts).
import { z } from "zod";

export const REVIEW_REPORT_REASONS = [
  "Abusive or harassing",
  "Spoilers not marked",
  "Spam or advertising",
  "Not about the book",
  "Something else",
] as const;
export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];

export const REVIEW_REPORT_NOTE_MAX = 500;

export const reviewReportSchema = z.object({
  reason: z.enum(REVIEW_REPORT_REASONS),
  note: z.string().trim().max(REVIEW_REPORT_NOTE_MAX).optional(),
});

// What the reviewer is told, in the bell and in a push. Never names who reported it or which librarian acted.
export const reviewHiddenMessage = (bookTitle: string | null) =>
  `We've hidden your review of ${bookTitle ?? "a book"} because it broke our community rules. Only you can still see it. If you think we got it wrong, reply to support.`;
