// The reports queue's rules, apart from the database so the tests can run them under plain Node.
// lib/staffReports.ts re-exports these and does the work.

export const REPORT_KINDS = ["list", "comment", "review", "book"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const isReportKind = (value: unknown): value is ReportKind => typeof value === "string" && (REPORT_KINDS as readonly string[]).includes(value);

export const REPORT_ACTIONS = ["dismiss", "hide", "hide_rating", "resolve", "escalate"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

// What each action may be used on: hiding is for lists, comments and reviews; hiding a review's rating as
// well is for reviews only; "resolve" (it's been fixed) for books.
export function actionAllowed(kind: ReportKind, action: ReportAction): boolean {
  if (action === "hide") return kind !== "book";
  if (action === "hide_rating") return kind === "review";
  if (action === "resolve") return kind === "book";
  return true;
}
