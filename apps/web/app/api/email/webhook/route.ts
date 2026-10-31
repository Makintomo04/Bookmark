import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { addressesToStop, verifyResendSignature } from "@/lib/resendWebhook";

// Resend's bounce and complaint webhook (lib/resendWebhook.ts): a lasting bounce or a spam complaint
// switches that address's weekly email off. Set up in Resend under Webhooks, subscribed to email.bounced
// and email.complained, with its signing secret in RESEND_WEBHOOK_SECRET. Unsigned requests get a 401.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const signed = verifyResendSignature(
    body,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") },
    process.env.RESEND_WEBHOOK_SECRET
  );
  if (!signed) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Not JSON" }, { status: 400 });
  }
  const addresses = addressesToStop(event as Parameters<typeof addressesToStop>[0]);
  let stopped = 0;
  for (const email of addresses) {
    // Addresses are matched whatever their case: providers don't always echo it back as it was typed.
    stopped += (await prisma.user.updateMany({ where: { email: { equals: email, mode: "insensitive" }, weeklyEmail: true }, data: { weeklyEmail: false } })).count;
  }
  if (stopped) console.log("[email/webhook]", (event as { type?: string }).type, "weekly email off for", stopped);
  // Resend retries anything but a 2xx, so every signed event is acknowledged, acted on or not.
  return NextResponse.json({ ok: true, stopped });
}
