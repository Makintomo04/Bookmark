import { sendMail } from "@/lib/mailer";
import { siteUrl } from "@/lib/siteUrl";
import { supportEmail } from "@/lib/support";

// Every report a reader files reaches a person straight away: an email to SUPPORT_EMAIL with what was
// reported as it read at that moment, so an author editing or deleting it afterwards doesn't erase the
// evidence. Never throws: a report is saved whether or not the alert goes out.

export interface ReportAlert {
  // "list" or "comment" (a reading-circle comment).
  kind: "list" | "comment";
  // The reported item's id.
  id: string;
  reason: string;
  reporterId: string;
  // Who wrote or owns it.
  authorId?: string | null;
  // The reported text as it stood (a list's title and description, a comment's body).
  excerpt?: string | null;
  // Where staff can see it, relative to the site, e.g. /lists/<id>.
  path: string;
}

const EXCERPT_MAX = 2000;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function reportAlertMessage(alert: ReportAlert) {
  const url = `${siteUrl}${alert.path}`;
  const excerpt = (alert.excerpt ?? "").slice(0, EXCERPT_MAX);
  const lines = [
    `A reader reported a ${alert.kind === "list" ? "list" : "reading-circle comment"}.`,
    `Reason: ${alert.reason}`,
    `Item: ${alert.kind} ${alert.id}`,
    `Reported by user ${alert.reporterId}${alert.authorId ? `; written by user ${alert.authorId}` : ""}`,
    `Where: ${url}`,
    "",
    "As it read when reported:",
    excerpt || "(no text)",
  ];
  return {
    subject: `[Bookmark report] ${alert.kind}: ${alert.reason}`,
    text: lines.join("\n"),
    html: lines.map((l) => (l ? `<p>${escapeHtml(l)}</p>` : "<br>")).join(""),
  };
}

export async function alertReport(alert: ReportAlert, send: typeof sendMail = sendMail): Promise<void> {
  const message = reportAlertMessage(alert);
  if (!supportEmail) {
    console.warn(`[reports] SUPPORT_EMAIL isn't set, so this report wasn't emailed:\n${message.text}`);
    return;
  }
  try {
    await send({ to: supportEmail, ...message });
  } catch (err) {
    console.error(`[reports] couldn't email the report alert:`, err instanceof Error ? err.message : err, `\n${message.text}`);
  }
}
