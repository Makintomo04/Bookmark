import { z } from "zod"

// Reporting missing or incorrect details on a book page: what can be wrong, and what a report must
// hold. No database, so the book page's form and the API check the same rules.

export const BOOK_ISSUES = [
  { value: "cover", label: "Cover" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "description", label: "Description" },
  { value: "pages", label: "Page count" },
  { value: "series", label: "Series" },
  { value: "published", label: "First published" },
  { value: "genres", label: "Genres" },
  { value: "duplicate", label: "It's a duplicate of another book" },
  { value: "other", label: "Something else" },
] as const

export type BookIssue = (typeof BOOK_ISSUES)[number]["value"]

export const BOOK_REPORT_NOTE_MAX = 500

const issueValues = BOOK_ISSUES.map((i) => i.value) as [BookIssue, ...BookIssue[]]

export const bookReportSchema = z
  .object({
    workKey: z.string().min(1),
    issues: z.array(z.enum(issueValues)).min(1, "Choose what's wrong.").transform((issues) => Array.from(new Set(issues))),
    note: z.string().trim().max(BOOK_REPORT_NOTE_MAX, `Keep it under ${BOOK_REPORT_NOTE_MAX} characters.`).optional().transform((n) => n || null),
  })
  // "Something else" means nothing without a word on what.
  .refine((r) => !r.issues.includes("other") || !!r.note, { message: "Tell us what's wrong.", path: ["note"] })

export const issueLabel = (value: string) => BOOK_ISSUES.find((i) => i.value === value)?.label ?? value
