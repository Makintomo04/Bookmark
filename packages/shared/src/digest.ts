// The weekly email, "Your week in books" (BOO-48): Sunday morning, opt-in, one click to stop. It's how a
// reader who only uses the browser hears about their circle. Built from plain numbers and titles: the input
// has no field for anything someone wrote (comments, reviews, a recommendation's note), so none can leak
// in, and nothing is AI-written. No Plus promotion either, so it stays a service email. No database
// imports: plain Node loads this for the tests.

export interface DigestFriend {
  username: string;
  // What they did this week.
  kind: "finished" | "started" | "sent";
  bookTitle: string;
}

export interface DigestCheckpoint {
  circleTitle: string;
  label: string;
  // "YYYY-MM-DD"
  due: string;
}

export interface DigestCircle {
  title: string;
  // New comments this week the reader's progress already reaches. A count, never the words.
  newComments: number;
  // Members who finished the book this week.
  finished: number;
}

export interface DigestSeriesBook {
  title: string;
  seriesName: string | null;
}

export interface DigestData {
  // Used in the greeting, when they have one.
  name: string | null;
  // Days they read this week (ReadingDay rows), and books they finished.
  readingDays: number;
  finished: number;
  streak: number;
  goal: { year: number; books: number; target: number; pace: number } | null;
  checkpoints: DigestCheckpoint[];
  circles: DigestCircle[];
  friends: DigestFriend[];
  series: DigestSeriesBook[];
  // Absolute URLs.
  logUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

export const DIGEST_FRIENDS_MAX = 5;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (day: string) => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];

// Where an even pace would have them by `day`, counted from when they set the goal (`since`, a local day)
// or 1 January if earlier: someone who joins in November with a 12-book goal isn't 10 behind.
export function goalPace(target: number, day: string, since?: string): number {
  const year = Number(day.slice(0, 4));
  const yearStart = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const start = since && since.startsWith(`${year}-`) ? Math.max(yearStart, Date.parse(`${since}T00:00:00Z`)) : yearStart;
  const through = Math.min(1, Math.max(0, (Date.parse(`${day}T12:00:00Z`) - start) / (end - start)));
  return Math.round(target * through);
}

// "23 of 40 this year, 2 ahead of pace". Behind is said plainly: it's the reader's own email.
export function goalLine(goal: NonNullable<DigestData["goal"]>): string {
  const gap = goal.books - goal.pace;
  const pace = gap > 0 ? `${gap} ahead of pace` : gap < 0 ? `${-gap} behind pace` : "right on pace";
  return `${goal.books} of ${goal.target} books in ${goal.year}, ${goal.books >= goal.target ? "goal reached" : pace}`;
}

const friendLine = (f: DigestFriend) =>
  f.kind === "finished" ? `@${f.username} finished ${f.bookTitle}` : f.kind === "started" ? `@${f.username} started ${f.bookTitle}` : `@${f.username} sent you ${f.bookTitle}`;

const circleLine = (c: DigestCircle) => {
  const parts = [c.newComments > 0 && `${plural(c.newComments, "new comment")} you can read`, c.finished > 0 && `${plural(c.finished, "member")} finished`].filter(Boolean);
  return `${c.title}: ${parts.join(", ")}`;
};

const seriesLine = (s: DigestSeriesBook) => (s.seriesName ? `${s.title}, new in ${s.seriesName}` : s.title);

interface Section {
  heading: string;
  lines: string[];
}

// The email, or null when there's nothing to say: an empty week sends nothing. A goal's pace and an old
// streak aren't news on their own, so a reader who's gone quiet isn't sent "30 behind pace" every Sunday.
export function buildWeeklyDigest(data: DigestData): DigestEmail | null {
  const happened =
    data.readingDays > 0 ||
    data.finished > 0 ||
    data.checkpoints.length > 0 ||
    data.circles.some((c) => c.newComments > 0 || c.finished > 0) ||
    data.friends.length > 0 ||
    data.series.length > 0;
  if (!happened) return null;
  const you = [
    data.readingDays > 0 && `You read on ${plural(data.readingDays, "day")} this week`,
    data.finished > 0 && `${plural(data.finished, "book")} finished`,
    data.streak > 0 && `${plural(data.streak, "day")} in a row`,
    data.goal && goalLine(data.goal),
  ].filter((l): l is string => !!l);
  const circles = data.circles.filter((c) => c.newComments > 0 || c.finished > 0);
  const sections: Section[] = [
    { heading: "Your week", lines: you },
    { heading: "Due in your circles", lines: data.checkpoints.map((c) => `${c.label} in ${c.circleTitle}, due ${weekdayOf(c.due)}`) },
    { heading: "In your circles", lines: circles.map(circleLine) },
    { heading: "From friends", lines: data.friends.slice(0, DIGEST_FRIENDS_MAX).map(friendLine) },
    { heading: "New in your series", lines: data.series.map(seriesLine) },
  ].filter((s) => s.lines.length > 0);
  if (sections.length === 0) return null;

  const greeting = data.name ? `Hi ${data.name}, here's your week in books.` : "Here's your week in books.";
  const footer = "You get this because you turned on the weekly email in Bookmark.";

  const text = [
    greeting,
    "",
    ...sections.flatMap((s) => [s.heading, ...s.lines.map((l) => `- ${l}`), ""]),
    `Log today's reading: ${data.logUrl}`,
    "",
    footer,
    `Change your emails: ${data.settingsUrl}`,
    `Stop the weekly email: ${data.unsubscribeUrl}`,
  ].join("\n");

  const font = "font-family:Inter,-apple-system,'Segoe UI',Roboto,sans-serif";
  const html = [
    `<div style="${font};color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.5">`,
    `<h1 style="font-family:Literata,Georgia,serif;font-weight:600;font-size:24px;margin:0 0 8px">Your week in books</h1>`,
    `<p style="margin:0 0 24px;color:#555">${escapeHtml(greeting)}</p>`,
    ...sections.map(
      (s) =>
        `<h2 style="font-size:15px;margin:24px 0 8px">${escapeHtml(s.heading)}</h2><ul style="margin:0;padding-left:20px">${s.lines.map((l) => `<li style="margin:4px 0">${escapeHtml(l)}</li>`).join("")}</ul>`
    ),
    `<p style="margin:32px 0"><a href="${escapeHtml(data.logUrl)}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Log today's reading</a></p>`,
    `<p style="font-size:12px;color:#777;margin:0">${escapeHtml(footer)} <a href="${escapeHtml(data.settingsUrl)}" style="color:#777">Change your emails</a> or <a href="${escapeHtml(data.unsubscribeUrl)}" style="color:#777">stop the weekly email</a>.</p>`,
    `</div>`,
  ].join("");

  return { subject: "Your week in books", html, text };
}
