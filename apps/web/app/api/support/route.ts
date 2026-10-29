import { NextResponse } from "next/server";
import { supportEmail } from "@/lib/support";

// Where readers reach a person (lib/support.ts), for client pages that can't read SUPPORT_EMAIL themselves:
// the sign-in page's suspension notice. Null until it's set.
export function GET() {
  return NextResponse.json({ email: supportEmail });
}
