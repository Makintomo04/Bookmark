import { NextResponse } from "next/server";
import { androidAssetLinks } from "@/lib/appLinks";

// Android app links (lib/appLinks.ts).
export function GET() {
  const body = androidAssetLinks();
  return body ? NextResponse.json(body) : NextResponse.json({ error: "Not configured" }, { status: 404 });
}
