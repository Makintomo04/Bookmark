import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { platformOf } from "@/lib/mobileAuth";

// The app registers its Expo push token after sign-in, and removes it on sign-out. A token belongs to
// one install, so if someone else signs in on that phone it moves to them.
const isExpoToken = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 200 && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value);

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await req.json().catch(() => null);
  if (!isExpoToken(body?.token)) return NextResponse.json({ error: "That isn't an Expo push token." }, { status: 400 });
  const platform = platformOf(body?.platform);
  await prisma.pushToken.upsert({
    where: { token: body.token },
    create: { token: body.token, userId: user.id, platform },
    update: { userId: user.id, platform },
  });
  return NextResponse.json({ registered: true });
}

export async function DELETE(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await req.json().catch(() => null);
  if (typeof body?.token === "string") await prisma.pushToken.deleteMany({ where: { token: body.token, userId: user.id } });
  return NextResponse.json({ removed: true });
}
