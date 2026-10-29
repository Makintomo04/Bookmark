// Comments on a review: the limits and reasons the web and API share. Who may comment is
// canCommentOnReview in privacyRules.ts; the server work is lib/reviewComments.ts.
import { z } from "zod";

export const REVIEW_COMMENT_MAX = 1000;

export const REVIEW_COMMENT_REPORT_REASONS = ["Hateful or harassing", "Spoiler not marked", "Spam or advertising", "Something else"] as const;

export const reviewCommentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(REVIEW_COMMENT_MAX, `Comments can be up to ${REVIEW_COMMENT_MAX} characters`),
  // One level of replies: a reply's parent is always a top-level comment.
  parentId: z.string().min(1).optional(),
});

export const reviewCommentEditSchema = z.object({
  body: reviewCommentSchema.shape.body,
});

export const reviewCommentReportSchema = z.object({ reason: z.enum(REVIEW_COMMENT_REPORT_REASONS) });

// A comment as the review page shows it. A deleted one keeps its place for the replies under it, with no body.
export interface SerializedReviewComment {
  id: string;
  parentId: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  body: string | null;
  mine: boolean;
  author: { username: string | null; displayName: string | null; image: string | null; favColour: string | null; staffBadge: "team" | "librarian" | null } | null;
  replies: SerializedReviewComment[];
}
