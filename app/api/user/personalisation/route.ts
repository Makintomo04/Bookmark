import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { guardEntitlement } from "@/lib/entitlementsServer";
import { personalisationOf, personalisationSchema, personalisationSelect, setsPersonalisation } from "@/lib/personalisation";

// Profile theme and shelf card colour. Choosing one needs Plus (lib/entitlements.ts personalisation);
// going back to the defaults is always allowed.
export async function PATCH(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const parsed = personalisationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });

  if (setsPersonalisation(parsed.data)) {
    const refused = await guardEntitlement(currentUser.id, "personalisation");
    if (refused) return refused;
  }

  const user = await prisma.user.update({
    where: { id: currentUser.id },
    data: parsed.data,
    select: personalisationSelect,
  });
  return NextResponse.json({ ...user, ...personalisationOf(user) });
}
