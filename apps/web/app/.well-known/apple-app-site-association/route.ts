import { NextResponse } from "next/server";
import { appleAppSiteAssociation } from "@/lib/appLinks";

// iOS universal links (lib/appLinks.ts). Must be JSON, unredirected, at exactly this path.
export function GET() {
  const body = appleAppSiteAssociation();
  return body ? NextResponse.json(body) : NextResponse.json({ error: "Not configured" }, { status: 404 });
}
