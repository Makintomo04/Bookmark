import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { ApiError, apiFetch } from "@/lib/api";

// Picking a photo for a profile picture or a book cover: the reader chooses and crops it, the app shrinks
// it to a sensible size (the server takes 4MB at most), and apps/web/app/api/mobile/upload stores it.
// Returns the stored URL, or null when the reader backed out.

const MAX_EDGE = 1200;

// `kind` is kept with the upload on the server: it's the reader's own, and never shown as anyone else's cover.
export async function pickAndUploadImage(aspect: [number, number], kind: "avatar" | "banner" | "cover"): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect, quality: 1 });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];

  // Only ever shrinks: the longer edge down to MAX_EDGE.
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_EDGE) {
    context.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await (await context.renderAsync()).saveAsync({ compress: 0.82, format: SaveFormat.JPEG });

  const form = new FormData();
  if (Platform.OS === "web") {
    form.append("file", await (await fetch(image.uri)).blob(), "photo.jpg");
  } else {
    // React Native's FormData takes a file by its uri.
    form.append("file", { uri: image.uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);
  }
  form.append("kind", kind);
  const res = await apiFetch("/api/mobile/upload", { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return (body as { url: string }).url;
}
