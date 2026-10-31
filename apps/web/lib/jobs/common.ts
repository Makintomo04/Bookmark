import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/timeZone";

// What every scheduled job shares: the reader's zone, paging through the readers who opted in, and a
// deadline so one tick ends inside its function time. Whatever a tick doesn't reach is still due on the
// next one, inside the send's due window (packages/shared/src/reminders.ts DUE_WINDOW).

export const PAGE = 500;

export const zoneOf = (timeZone: string | null | undefined) => (timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE);

export interface JobContext {
  now: Date;
  // Epoch ms the job must stop by.
  deadline: number;
}

export const outOfTime = (ctx: JobContext) => Date.now() >= ctx.deadline;

// Pages of rows ordered by id, `PAGE` at a time, until there are none or the deadline passes.
export async function* pages<T extends { id: string }>(ctx: JobContext, load: (after: string | undefined) => Promise<T[]>): AsyncGenerator<T[]> {
  let after: string | undefined;
  while (!outOfTime(ctx)) {
    const rows = await load(after);
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE) return;
    after = rows[rows.length - 1].id;
  }
}

// Prisma's cursor arguments for the next page after `after`.
export const pageArgs = (after: string | undefined) => ({ take: PAGE, orderBy: { id: "asc" as const }, ...(after && { cursor: { id: after }, skip: 1 }) });
