import prisma from "@/lib/db";
import { pushContentFor, pushGroupOf, pushedToSelf, type PushContent } from "@bookmark/shared/push";

// Sends the push for new notifications to the recipients' phones, through Expo's push service. Which
// notifications are pushed, and their words, are in packages/shared/src/push.ts. Called after the
// Notification row is written (lib/notifications.ts); a push that fails is logged and never fails the
// request that caused it, since the bell has the notification either way.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Expo takes at most 100 messages a request.
const BATCH = 100;

export interface PushableNotification {
  userId: string;
  actorId: string;
  type: string;
  bookId?: string | null;
  buddyReadId?: string | null;
  clubId?: string | null;
  count?: number | null;
  workId?: string | null;
  message?: string | null;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: { path: string };
  sound: "default";
}

interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

async function contentFor(rows: PushableNotification[]): Promise<Map<PushableNotification, PushContent>> {
  const actorIds = Array.from(new Set(rows.map((r) => r.actorId)));
  const bookIds = Array.from(new Set(rows.flatMap((r) => (r.bookId ? [r.bookId] : []))));
  const circleIds = Array.from(new Set(rows.flatMap((r) => (r.buddyReadId ? [r.buddyReadId] : []))));
  const workIds = Array.from(new Set(rows.flatMap((r) => (r.workId ? [r.workId] : []))));
  const clubIds = Array.from(new Set(rows.flatMap((r) => (r.clubId ? [r.clubId] : []))));
  const [actors, books, circles, works, clubs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true } }),
    bookIds.length ? prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } }) : [],
    circleIds.length ? prisma.buddyRead.findMany({ where: { id: { in: circleIds } }, select: { id: true, title: true } }) : [],
    workIds.length ? prisma.work.findMany({ where: { id: { in: workIds } }, select: { id: true, title: true, authors: true, seriesName: true, seriesPosition: true, releaseDate: true } }) : [],
    clubIds.length ? prisma.club.findMany({ where: { id: { in: clubIds } }, select: { id: true, name: true } }) : [],
  ]);
  const clubName = new Map(clubs.map((c) => [c.id, c.name]));
  const username = new Map(actors.map((a) => [a.id, a.username]));
  const bookTitle = new Map(books.map((b) => [b.id, b.title]));
  const circleTitle = new Map(circles.map((c) => [c.id, c.title]));
  const workById = new Map(works.map((w) => [w.id, w]));

  const out = new Map<PushableNotification, PushContent>();
  for (const row of rows) {
    const work = row.workId ? workById.get(row.workId) : undefined;
    const content = pushContentFor({
      type: row.type,
      actorUsername: username.get(row.actorId) ?? null,
      bookTitle: (row.buddyReadId && circleTitle.get(row.buddyReadId)) || (row.bookId && bookTitle.get(row.bookId)) || work?.title || null,
      buddyReadId: row.buddyReadId ?? null,
      clubId: row.clubId ?? null,
      clubName: (row.clubId && clubName.get(row.clubId)) || null,
      count: row.count ?? null,
      seriesName: work?.seriesName ?? null,
      seriesPosition: work?.seriesPosition ?? null,
      author: work?.authors[0] ?? null,
      releaseDate: work?.releaseDate ?? null,
      message: row.message ?? null,
    });
    if (content) out.set(row, content);
  }
  return out;
}

export async function sendPushes(rows: PushableNotification[]) {
  const pushable = rows.filter((r) => pushGroupOf(r.type) && (r.userId !== r.actorId || pushedToSelf(r.type)));
  if (pushable.length === 0) return;
  try {
    const recipients = await prisma.user.findMany({
      where: { id: { in: Array.from(new Set(pushable.map((r) => r.userId))) } },
      select: { id: true, pushOff: true, pushTokens: { select: { token: true } } },
    });
    const byId = new Map(recipients.map((u) => [u.id, u]));
    const wanted = pushable.filter((r) => {
      const user = byId.get(r.userId);
      return user && user.pushTokens.length > 0 && !user.pushOff.includes(pushGroupOf(r.type)!);
    });
    if (wanted.length === 0) return;

    const contents = await contentFor(wanted);
    const messages: ExpoMessage[] = [];
    for (const row of wanted) {
      const content = contents.get(row);
      if (!content) continue;
      for (const { token } of byId.get(row.userId)!.pushTokens) {
        messages.push({ to: token, title: content.title, body: content.body, data: { path: content.path }, sound: "default" });
      }
    }
    for (let i = 0; i < messages.length; i += BATCH) await deliver(messages.slice(i, i + BATCH));
  } catch (error) {
    console.error("[push] couldn't send", error);
  }
}

// Pushes that aren't a notification: the reminders the cron tick sends (lib/jobs). Nobody did anything, so
// there's no actor or bell row; the words are already written (packages/shared/src/reminders.ts). Each
// recipient's tokens are passed in, since the job loaded them when choosing who's due. Returns how many
// readers had a phone to send to; never throws.
export async function sendSystemPushes(sends: { tokens: string[]; content: PushContent }[]): Promise<number> {
  const messages: ExpoMessage[] = sends.flatMap(({ tokens, content }) =>
    tokens.map((to) => ({ to, title: content.title, body: content.body, data: { path: content.path }, sound: "default" as const }))
  );
  try {
    for (let i = 0; i < messages.length; i += BATCH) await deliver(messages.slice(i, i + BATCH));
  } catch (error) {
    console.error("[push] couldn't send", error);
  }
  return sends.filter((s) => s.tokens.length > 0).length;
}

async function deliver(messages: ExpoMessage[]) {
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      // Only needed once "enhanced security for push" is on in the Expo project.
      ...(process.env.EXPO_ACCESS_TOKEN && { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }),
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.error("[push] Expo answered", res.status, await res.text().catch(() => ""));
    return;
  }
  const { data } = (await res.json()) as { data?: ExpoTicket[] };
  // A phone that uninstalled the app or turned notifications off: forget its token.
  const gone = (data ?? []).flatMap((ticket, i) => (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" ? [messages[i].to] : []));
  if (gone.length) await prisma.pushToken.deleteMany({ where: { token: { in: gone } } });
}
