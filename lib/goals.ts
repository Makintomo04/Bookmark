import { z } from "zod";

// Reading goals: the yearly book count everyone has, plus the Plus goals (a page total for the year
// and a monthly pace). Pure, shared by /api/reading-goal, the profile widget and the stats page.

export const GOAL_BOOKS_MAX = 999;
export const GOAL_PAGES_MAX = 99_999;
export const GOAL_MONTHLY_MAX = 99;

const optionalTarget = (max: number) => z.union([z.coerce.number().int().min(1).max(max), z.null()]).optional();

// `targetPages` / `targetBooksPerMonth`: a number sets, null clears, absent leaves alone.
export const goalInputSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  targetBooks: z.coerce.number().int().min(1, `Goal must be between 1 and ${GOAL_BOOKS_MAX} books.`).max(GOAL_BOOKS_MAX, `Goal must be between 1 and ${GOAL_BOOKS_MAX} books.`),
  targetPages: optionalTarget(GOAL_PAGES_MAX),
  targetBooksPerMonth: optionalTarget(GOAL_MONTHLY_MAX),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

// True when the request sets a Plus goal (clearing one is always allowed, so a lapsed account can tidy up).
export function setsExtraGoals(input: Pick<GoalInput, "targetPages" | "targetBooksPerMonth">): boolean {
  return typeof input.targetPages === "number" || typeof input.targetBooksPerMonth === "number";
}

export interface StoredGoal {
  targetBooks: number;
  targetPages?: number | null;
  targetBooksPerMonth?: number | null;
}

export interface MonthlyPace {
  // Books a month: the reader's own target (Plus), or the yearly goal spread over twelve months.
  perMonth: number;
  custom: boolean;
}

// The monthly pace is a stat everyone gets, worked out from the yearly goal. A custom monthly target
// replaces it while `allowCustom` (Plus); a lapsed account falls back to the worked-out pace.
export function monthlyPace(goal: StoredGoal, allowCustom = true): MonthlyPace {
  if (allowCustom && goal.targetBooksPerMonth && goal.targetBooksPerMonth > 0) return { perMonth: goal.targetBooksPerMonth, custom: true };
  return { perMonth: goal.targetBooks / 12, custom: false };
}

// "2", or "2.5" for a pace that isn't whole.
export function formatPace(perMonth: number): string {
  const rounded = Math.round(perMonth * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export interface GoalBook {
  status: string;
  completedAt: Date | string | null;
  pages: number;
}

export interface GoalProgress {
  // Books finished this year, and their pages.
  books: number;
  pages: number;
  // Books finished so far this calendar month.
  thisMonth: number;
  month: number;
}

// Progress against a goal from the shelf, in the browser's calendar (the widget's view; the stats
// page recomputes from dated reads in the reader's time zone).
export function goalProgress(books: GoalBook[], now = new Date()): GoalProgress {
  const year = now.getFullYear();
  const month = now.getMonth();
  const done = books.filter((b) => b.status === "COMPLETED" && b.completedAt && new Date(b.completedAt).getFullYear() === year);
  return {
    books: done.length,
    pages: done.reduce((sum, b) => sum + (b.pages > 0 ? b.pages : 0), 0),
    thisMonth: done.filter((b) => new Date(b.completedAt!).getMonth() === month).length,
    month,
  };
}
