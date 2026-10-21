// Wrapped season opens on 1 December: from then to the year's end, the nav offers "Your <year>
// Wrapped". Kept apart from lib/stats.ts (which needs Prisma) so the header can import it.
// Pass nothing in the browser to use the reader's own calendar.
export function isWrappedSeason(now = new Date()): boolean {
  return now.getMonth() === 11;
}
