import { requirePermission } from "@/lib/apiAuth";

// Throws on purpose, so an admin can check that a server error reaches Sentry with a release and a readable
// stack trace (BOO-54, /staff/monitoring). The 500 also counts towards the 5xx alert.
export async function POST() {
  const { response } = await requirePermission("staff.log");
  if (response) return response;
  throw new Error(`Bookmark test error from the server, ${new Date().toISOString()}`);
}
