import { getFollowList } from "@/lib/follows";

export async function GET(
  req: Request,
  { params }: { params: { username: string } }
) {
  return getFollowList(req, params.username, "followers");
}
