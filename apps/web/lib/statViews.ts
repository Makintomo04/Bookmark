import prisma from "@/lib/db";
import type { SavedStatView } from "@bookmark/shared/statsExplorer";

// The reader's saved stat views (BOO-82), oldest first, so the list keeps its order as views are added.
export async function listStatViews(userId: string): Promise<SavedStatView[]> {
  const rows = await prisma.statView.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, query: true, createdAt: true } });
  return rows.map((r) => ({ id: r.id, name: r.name, query: r.query, createdAt: r.createdAt.toISOString() }));
}
