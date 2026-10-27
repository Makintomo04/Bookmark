import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

let transporterPromise: Promise<Transporter> | null = null;

// How mail goes out. Without an SMTP host, development falls back to a disposable Ethereal test inbox;
// production (which on Vercel includes preview deployments) refuses instead, so verification,
// password-reset and magic-link emails can never silently go to a throwaway inbox.
// MAIL_OUTBOX_DIR (the end-to-end tests, e2e/README.md) writes each message to a JSON file there instead
// of sending it. Production ignores it, so a stray setting can't swallow real mail.
export function mailTransportFor(env: { NODE_ENV?: string; EMAIL_SERVER_HOST?: string; MAIL_OUTBOX_DIR?: string }): "smtp" | "ethereal" | "outbox" {
  if (env.MAIL_OUTBOX_DIR && env.NODE_ENV !== "production") return "outbox";
  if (env.EMAIL_SERVER_HOST) return "smtp";
  if (env.NODE_ENV === "production") {
    throw new Error("EMAIL_SERVER_HOST is not set: production can't send verification, password-reset or sign-in emails.");
  }
  return "ethereal";
}

async function buildTransporter(): Promise<Transporter> {
  const transport = mailTransportFor(process.env);
  if (transport === "outbox") return nodemailer.createTransport({ jsonTransport: true });
  if (transport === "smtp") {
    return Promise.resolve(
      nodemailer.createTransport({
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT) || 587,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      })
    );
  }

  // Development only (see mailTransportFor), so the test inbox's login is fine to log.
  return nodemailer.createTestAccount().then((testAccount) => {
    console.warn(
      `No EMAIL_SERVER_HOST set - using a disposable Ethereal test inbox for dev. Preview sent mail at https://ethereal.email using login ${testAccount.user} / ${testAccount.pass}`
    );
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  });
}

function getTransporter(): Promise<Transporter> {
  if (!transporterPromise) {
    // Not cached when it fails, so a missing setting is reported on every send rather than once.
    transporterPromise = buildTransporter().catch((err) => {
      transporterPromise = null;
      throw err;
    });
  }
  return transporterPromise;
}

export async function sendMail(options: { to: string; subject: string; html: string; text: string }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || "Bookmark <no-reply@bookmark.app>",
    ...options,
  });
  const outbox = process.env.MAIL_OUTBOX_DIR;
  if (outbox && mailTransportFor(process.env) === "outbox") {
    mkdirSync(outbox, { recursive: true });
    writeFileSync(path.join(outbox, `${Date.now()}-${info.messageId.replace(/[^\w.-]/g, "")}.json`), info.message.toString());
    return info;
  }
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.warn(`Preview the sent email at: ${previewUrl}`);
  }
  return info;
}
