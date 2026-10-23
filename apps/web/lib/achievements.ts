import prisma from "@/lib/db";
import { createNotifications } from "@/lib/notifications";
import { Prisma } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { ACHIEVEMENTS, AchievementKey, AchievementDefinition, LEGACY_KEYS, Milestone, milestoneKey } from "@/lib/achievements-catalog";
import { finishedBookWhere } from "@/lib/readerTier";
import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE, TIME_ZONE_HEADER, isValidTimeZone, localDay, previousDay } from "@/lib/timeZone";

export { ACHIEVEMENTS, getAchievementTitle } from "@/lib/achievements-catalog";
export type { AchievementKey, AchievementDefinition } from "@/lib/achievements-catalog";

// The number each achievement's milestones are measured against.
export type AchievementStats = Record<AchievementKey, number>;

export interface EarnedMilestone {
  achievement: AchievementDefinition;
  milestone: Milestone;
}

// What just happened, so only the ladders it can move get recomputed. A page update can't change
// books read or goals met, for example. "all" (the default) checks every ladder.
export type AchievementTrigger = "progress" | "completion" | "rating" | "review" | "goal" | "buddyRead" | "all";

const ALL_KEYS = ACHIEVEMENTS.map((a) => a.key);

const LADDERS_FOR: Record<AchievementTrigger, AchievementKey[]> = {
  // Reaching the last page (or finishing) can finish a reading circle.
  progress: ["PAGES_READ", "STREAK", "BUDDY_READS_FINISHED"],
  completion: ["BOOKS_READ", "PAGES_READ", "BIG_BOOKS", "STREAK", "GOALS", "BUDDY_READS_FINISHED"],
  rating: ["RATINGS"],
  review: ["REVIEWS"],
  goal: ["GOALS"],
  // Someone joined a reading circle you host.
  buddyRead: ["BUDDY_READS_FINISHED", "BUDDY_READS_HOSTED"],
  all: ALL_KEYS,
};

// Real reading: these mark today as a reading day for the streak.
const READING_TRIGGERS = new Set<AchievementTrigger>(["progress", "completion"]);

export interface AwardOptions {
  // One trigger, or several when one request did several things (finished a book and rated it).
  trigger?: AchievementTrigger | AchievementTrigger[];
  // The reader's IANA zone, if the caller has it. Otherwise the browser's `tz` cookie, then the
  // stored User.timeZone, then UTC. See lib/timeZone.ts.
  timeZone?: string;
}

// ---- Time zone ---------------------------------------------------------------------------

// The `tz` cookie set by the browser (VerifyEmailBanner), or the X-Time-Zone header the mobile app sends.
// Only meaningful inside the signed-in user's own request, which is where awardNewAchievements runs.
function requestTimeZone(): string | undefined {
  try {
    const raw = cookies().get(TIME_ZONE_COOKIE)?.value ?? headers().get(TIME_ZONE_HEADER) ?? undefined;
    const zone = raw ? decodeURIComponent(raw) : undefined;
    return isValidTimeZone(zone) ? zone : undefined;
  } catch {
    // Outside a request (a script), or a malformed cookie.
    return undefined;
  }
}

// Stored zone, updated when the client reports a different valid one; UTC when there's neither.
async function resolveTimeZone(userId: string, clientZone: string | undefined): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
  if (clientZone && clientZone !== user?.timeZone) {
    await prisma.user.update({ where: { id: userId }, data: { timeZone: clientZone } });
    return clientZone;
  }
  return user?.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : DEFAULT_TIME_ZONE;
}

// ---- Streak ------------------------------------------------------------------------------

export async function recordReadingDay(userId: string, timeZone: string, at = new Date()) {
  const day = localDay(at, timeZone);
  try {
    await prisma.readingDay.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day },
      update: {},
    });
  } catch (e) {
    // A concurrent request recorded the same day.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
}

// Consecutive days, ending today or yesterday in `timeZone`, with real reading: a ReadingDay row
// (page updates, recorded from now on) or a finished book (COMPLETED_BOOK activity, which also
// covers history from before ReadingDay existed). Adding, rating or reviewing a book doesn't count.
// `cap` stops counting there, so awarding only reads as many days as the next milestone needs.
async function readingStreak(userId: string, timeZone: string, cap = Infinity): Promise<number> {
  const today = localDay(new Date(), timeZone);
  let since: string | undefined;
  let sinceDate: Date | undefined;
  if (Number.isFinite(cap)) {
    since = today;
    for (let i = 0; i <= cap; i++) since = previousDay(since);
    // A day margin either side of the zone offset.
    sinceDate = new Date(`${since}T00:00:00Z`);
    sinceDate.setUTCDate(sinceDate.getUTCDate() - 1);
  }

  const [days, completions] = await Promise.all([
    prisma.readingDay.findMany({ where: { userId, ...(since && { day: { gte: since } }) }, select: { day: true } }),
    prisma.activity.findMany({
      where: { userId, type: "COMPLETED_BOOK", ...(sinceDate && { createdAt: { gte: sinceDate } }) },
      select: { createdAt: true },
    }),
  ]);
  const active = new Set(days.map((d) => d.day));
  for (const a of completions) active.add(localDay(a.createdAt, timeZone));

  // Today isn't over, so a streak that reached yesterday is still alive until the reader's midnight.
  let cursor = active.has(today) ? today : previousDay(today);
  let streak = 0;
  while (streak < cap && active.has(cursor)) {
    streak++;
    cursor = previousDay(cursor);
  }
  return streak;
}

// ---- Stats -------------------------------------------------------------------------------

interface StatsContext {
  timeZone?: string;
  // Per ladder, the value past which the exact number doesn't matter (for awarding).
  caps?: Partial<Record<AchievementKey, number>>;
}

async function computeStats(userId: string, keys: AchievementKey[], ctx: StatsContext): Promise<Partial<AchievementStats>> {
  const need = new Set(keys);
  const stats: Partial<AchievementStats> = {};
  const tasks: Promise<void>[] = [];

  // Books read, pages read and big books come from two aggregates instead of loading every book.
  // A book counts as read once finished, re-reads included (finishedBookWhere); pages also count
  // from books in progress that haven't been finished before.
  if (need.has("BOOKS_READ") || need.has("PAGES_READ") || need.has("BIG_BOOKS")) {
    tasks.push(
      Promise.all([
        prisma.book.aggregate({
          where: { userId, ...finishedBookWhere },
          _count: { _all: true },
          _sum: { pages: true },
          _max: { pages: true },
        }),
        prisma.book.aggregate({
          where: { userId, status: "STARTED", timesRead: { lt: 1 } },
          _sum: { currentPage: true },
        }),
      ]).then(([finished, inProgress]) => {
        stats.BOOKS_READ = finished._count._all;
        stats.PAGES_READ = (finished._sum.pages ?? 0) + (inProgress._sum.currentPage ?? 0);
        stats.BIG_BOOKS = finished._max.pages ?? 0;
      })
    );
  }

  if (need.has("GOALS")) {
    tasks.push(
      (async () => {
        const goals = await prisma.readingGoal.findMany({ where: { userId, targetBooks: { gt: 0 } }, select: { year: true, targetBooks: true } });
        // Goal years are UTC calendar years, as before (the server ran in UTC).
        const met = await Promise.all(
          goals.map(async (g) => {
            const completed = await prisma.book.count({
              where: {
                userId,
                status: "COMPLETED",
                completedAt: { gte: new Date(Date.UTC(g.year, 0, 1)), lt: new Date(Date.UTC(g.year + 1, 0, 1)) },
              },
            });
            return completed >= g.targetBooks;
          })
        );
        stats.GOALS = met.filter(Boolean).length;
      })()
    );
  }

  if (need.has("REVIEWS")) {
    tasks.push(
      prisma.book.count({ where: { userId, review: { gt: "" } } }).then((n) => {
        stats.REVIEWS = n;
      })
    );
  }

  if (need.has("RATINGS")) {
    tasks.push(
      prisma.book.count({ where: { userId, rating: { gt: 0 } } }).then((n) => {
        stats.RATINGS = n;
      })
    );
  }

  // A reading circle counts as finished once the member's book reached 100% (set by onBuddyReadProgress).
  if (need.has("BUDDY_READS_FINISHED")) {
    tasks.push(
      prisma.buddyReadMember.count({ where: { userId, finishedAt: { not: null } } }).then((n) => {
        stats.BUDDY_READS_FINISHED = n;
      })
    );
  }

  // Hosting counts once someone else has joined.
  if (need.has("BUDDY_READS_HOSTED")) {
    tasks.push(
      prisma.buddyRead
        .findMany({ where: { hostId: userId }, select: { _count: { select: { members: true } } } })
        .then((hosted) => {
          stats.BUDDY_READS_HOSTED = hosted.filter((b) => b._count.members >= 2).length;
        })
    );
  }

  if (need.has("STREAK")) {
    tasks.push(
      (async () => {
        const zone = ctx.timeZone ?? (await resolveTimeZone(userId, undefined));
        stats.STREAK = await readingStreak(userId, zone, ctx.caps?.STREAK);
      })()
    );
  }

  await Promise.all(tasks);
  return stats;
}

// Every ladder's current number. Uses the stored time zone (not the request's), so it's also
// right when called for someone other than the signed-in user.
export async function computeAchievementStats(userId: string): Promise<AchievementStats> {
  return (await computeStats(userId, ALL_KEYS, {})) as AchievementStats;
}

// ---- Awarding ----------------------------------------------------------------------------

// Renames pre-milestone badges to the rung they became, keeping their earned date.
// Returns whether there was anything to move, i.e. this is the user's first run on milestones.
async function migrateLegacyAchievements(userId: string, existing: { id: string; key: string }[]): Promise<boolean> {
  const legacy = existing.filter((e) => e.key in LEGACY_KEYS);
  if (legacy.length === 0) return false;
  const keys = new Set(existing.map((e) => e.key));
  for (const record of legacy) {
    const next = LEGACY_KEYS[record.key];
    if (keys.has(next)) {
      await prisma.userAchievement.delete({ where: { id: record.id } });
    } else {
      await prisma.userAchievement.update({ where: { id: record.id }, data: { key: next } });
      keys.add(next);
    }
  }
  return true;
}

// Inserts the new rungs in one round trip. If a concurrent request got some first, the batch
// fails on the unique index, so fall back to one at a time and keep only the ones we created.
async function createMilestones(userId: string, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  try {
    await prisma.userAchievement.createMany({ data: keys.map((key) => ({ userId, key })) });
    return new Set(keys);
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  const created = new Set<string>();
  for (const key of keys) {
    try {
      await prisma.userAchievement.create({ data: { userId, key } });
      created.add(key);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return created;
}

// Awards any milestones the user has newly reached, records today as a reading day for reading
// triggers, and returns the new milestones along with the stats it computed.
// Stats only cover the ladders the trigger can move (all of them for "all"); STREAK is capped at
// the next unearned milestone unless `fullStats` asks for the real number (the achievements page).
export async function syncAchievements(
  userId: string,
  options: AwardOptions & { fullStats?: boolean } = {}
): Promise<{ awarded: EarnedMilestone[]; stats: Partial<AchievementStats> }> {
  const triggers = Array.isArray(options.trigger) ? options.trigger : [options.trigger ?? "all"];

  const existing = await prisma.userAchievement.findMany({ where: { userId }, select: { id: true, key: true } });
  const migrated = await migrateLegacyAchievements(userId, existing);
  const earnedKeys = new Set(existing.map((e) => LEGACY_KEYS[e.key] ?? e.key));

  // A first run on milestones backfills every ladder (quietly, below), whatever the trigger.
  const triggered = new Set<AchievementKey>(migrated ? ALL_KEYS : triggers.flatMap((t) => LADDERS_FOR[t] ?? ALL_KEYS));
  const unearned = new Map<AchievementKey, Milestone[]>();
  for (const a of ACHIEVEMENTS) {
    if (!triggered.has(a.key)) continue;
    const rest = a.milestones.filter((m) => !earnedKeys.has(milestoneKey(a.key, m.value)));
    // A ladder with every rung earned can't award anything, so skip computing it.
    if (rest.length > 0 || options.fullStats) unearned.set(a.key, rest);
  }

  const isReading = triggers.some((t) => READING_TRIGGERS.has(t));
  let timeZone: string | undefined;
  if (isReading || unearned.has("STREAK")) {
    const clientZone = isValidTimeZone(options.timeZone) ? options.timeZone : requestTimeZone();
    timeZone = await resolveTimeZone(userId, clientZone);
  }
  if (isReading && timeZone) await recordReadingDay(userId, timeZone);

  const streakRungs = unearned.get("STREAK");
  const caps: StatsContext["caps"] = {};
  if (streakRungs && !options.fullStats) caps.STREAK = Math.max(0, ...streakRungs.map((m) => m.value));
  const stats = await computeStats(userId, Array.from(unearned.keys()), { timeZone, caps });

  const fresh: EarnedMilestone[] = [];
  unearned.forEach((rungs, key) => {
    const achievement = ACHIEVEMENTS.find((a) => a.key === key)!;
    for (const milestone of rungs) {
      if ((stats[key] ?? 0) >= milestone.value) fresh.push({ achievement, milestone });
    }
  });

  const created = await createMilestones(userId, fresh.map((f) => milestoneKey(f.achievement.key, f.milestone.value)));
  const awarded = fresh.filter((f) => created.has(milestoneKey(f.achievement.key, f.milestone.value)));

  // One notification per achievement, for the highest rung reached, so finishing a
  // 1,000-page book doesn't announce 300, 500 and 750 too. Moving an existing user onto
  // milestones backfills rungs they passed long ago, which isn't news, so stay quiet then.
  if (!migrated && awarded.length > 0) {
    const highest = new Map<AchievementKey, Milestone>();
    for (const { achievement, milestone } of awarded) {
      const current = highest.get(achievement.key);
      if (!current || milestone.value > current.value) highest.set(achievement.key, milestone);
    }
    await createNotifications(
      Array.from(highest, ([key, milestone]) => ({
        userId,
        actorId: userId,
        type: "ACHIEVEMENT_EARNED" as const,
        achievementKey: milestoneKey(key, milestone.value),
      })),
    );
  }

  return { awarded, stats };
}

// Backward compatible: awardNewAchievements(userId) still checks every ladder. Pass a trigger to
// check only what an event can move, e.g. awardNewAchievements(userId, { trigger: "progress" }).
export async function awardNewAchievements(userId: string, options: AwardOptions = {}): Promise<EarnedMilestone[]> {
  return (await syncAchievements(userId, options)).awarded;
}

// The current reading streak, uncapped, in the reader's stored zone: the same number the
// achievements page shows. Used by /stats.
export async function getReadingStreak(userId: string): Promise<number> {
  return readingStreak(userId, await resolveTimeZone(userId, undefined));
}
