import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { apiFetch } from "@/lib/api";

// The PNG cards the share sheet (components/share/ShareImageSheet.tsx) saves and shares.

// Cards live in their own cache folder, one fresh subfolder per download, so a path is never reused: the
// image cache keys on the file's URI and would otherwise show last month's card, or the last account's.
// The file keeps its plain name, which is what Photos and the share sheet show.
const cardsFolder = () => new Directory(Paths.cache, "share-cards");

// Signing out empties it, so the next reader on this phone never sees the last one's cards.
export function clearShareCards() {
  if (Platform.OS === "web") return;
  try {
    const folder = cardsFolder();
    if (folder.exists) folder.delete();
  } catch {
    // Only the cache: nothing to tell anyone.
  }
}

export async function downloadShareCard(path: string, name: string): Promise<string> {
  // Always drawn fresh: the HTTP cache would otherwise hand back a card from minutes ago, before the book
  // just finished, or (keyed on the URL alone) the last account's.
  const res = await apiFetch(path, { headers: { accept: "image/png", "cache-control": "no-store" } });
  if (!res.ok) throw new Error(res.status === 404 ? "There's nothing to draw for this yet." : "We couldn't make the image. Try again in a moment.");
  clearShareCards();
  const folder = new Directory(cardsFolder(), String(Date.now()));
  folder.create({ intermediates: true });
  const file = new File(folder, `${name}.png`);
  file.create();
  await file.write(await res.arrayBuffer());
  return file.uri;
}
