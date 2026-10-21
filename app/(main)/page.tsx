import { redirect } from "next/navigation";
import getCurrentUser from "../actions/getCurrentUser";
import Landing from "../components/landing/Landing";

export default async function Home() {
  // A valid session whose account no longer exists comes back as null, so it
  // falls through to the landing page like any logged-out visitor.
  const user = await getCurrentUser();

  if (user) {
    redirect(user.favColour && user.username ? `/u/${encodeURIComponent(user.username)}` : "/new-user");
  }

  return <Landing />;
}
