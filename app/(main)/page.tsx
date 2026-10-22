import { Metadata } from "next";
import { redirect } from "next/navigation";
import getCurrentUser from "../actions/getCurrentUser";
import Landing from "../components/landing/Landing";
import { safeCallbackPath, withCallback } from "@/lib/callbackUrl";

// Logged-out visitors only see this page, so it carries the pitch, not the (main) layout's "Home".
export const metadata: Metadata = {
  title: { absolute: "Bookmark — Read with friends, spoiler-free" },
};

export default async function Home({ searchParams }: { searchParams: { callbackUrl?: string } }) {
  // A valid session whose account no longer exists comes back as null, so it
  // falls through to the landing page like any logged-out visitor.
  const user = await getCurrentUser();

  if (user) {
    // Sign-in lands here with ?callbackUrl= when the reader was headed somewhere (e.g. an invite):
    // onboarding comes first, then on to it.
    const callbackPath = safeCallbackPath(searchParams?.callbackUrl);
    if (!user.favColour || !user.username) redirect(withCallback("/new-user", callbackPath));
    redirect(callbackPath ?? `/u/${encodeURIComponent(user.username)}`);
  }

  return <Landing />;
}
