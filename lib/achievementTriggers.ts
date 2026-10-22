import type { AchievementTrigger } from "@/lib/achievements";

// What a book-progress request did, as achievement triggers. "progress" and "completion" are the ones that
// mark today as a reading day for the streak (lib/achievements.ts READING_TRIGGERS), so they're only sent
// when the reader actually moved on in the book or finished it. Anything else (start, pause, Want to read…)
// re-checks every ladder without counting as reading, as before.
export function progressTriggers(input: {
  action: string;
  // The page or minute changed: saving the same place again isn't reading.
  moved: boolean;
  rated: boolean;
  reviewed: boolean;
}): AchievementTrigger[] {
  const triggers: AchievementTrigger[] = [];
  if (input.action === "complete") triggers.push("completion");
  else if (input.action === "progress" && input.moved) triggers.push("progress");
  if (input.rated) triggers.push("rating");
  if (input.reviewed) triggers.push("review");
  return triggers.length ? triggers : ["all"];
}
