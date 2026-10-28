import { permanentRedirect } from "next/navigation";
import { normaliseUsername } from "@/lib/profile";

// Usernames are stored lowercase (lib/profile.ts), so a username that arrives in a URL or a request body
// is lowercased before it's looked up: /u/Persona and /u/persona reach the same reader, as do "@Persona"
// in a circle invite and "persona". Accounts from before usernames were normalised are lowercased by
// scripts/lowercase-usernames.ts, so the stored value is always the lowercase one.
export const handleOf = (raw: string | null | undefined) => normaliseUsername(raw ?? "");

// For the /u/<username> pages: the lowercase handle, after sending a capitalised address on to the one
// the profile canonically lives at, so share links and search engines see one address per reader.
// `rest` is the path after the handle (and any query string), kept on the way.
export function profileHandle(raw: string, rest = "") {
  const handle = handleOf(raw);
  if (handle !== raw) permanentRedirect(`/u/${encodeURIComponent(handle)}${rest}`);
  return handle;
}
