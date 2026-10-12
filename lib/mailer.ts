import nodemailer, { Transporter } from "nodemailer";

let transporterPromise: Promise<Transporter> | null = null;

function buildTransporter(): Promise<Transporter> {
  if (process.env.EMAIL_SERVER_HOST) {
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

  // No production email provider configured - fall back to a disposable
  // Ethereal test inbox so email flows are still testable in local dev.
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
    transporterPromise = buildTransporter();
  }
  return transporterPromise;
}

export async function sendMail(options: { to: string; subject: string; html: string; text: string }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || "Bookmark <no-reply@bookmark.app>",
    ...options,
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.warn(`Preview the sent email at: ${previewUrl}`);
  }
  return info;
}
