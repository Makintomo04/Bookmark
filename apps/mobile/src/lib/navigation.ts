import { router } from "expo-router";

// Closes a screen that was opened over the tabs. A screen opened straight from a link (a push, an
// invite, a universal link) has nothing behind it, so it goes to the library instead.
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
