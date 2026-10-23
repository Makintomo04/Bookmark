import { router } from "expo-router";

// Closes a screen that was opened over the tabs. A screen opened straight from a link (a push, an
// invite, a universal link) has nothing behind it, so it goes to `fallback` instead: the library unless
// there's a better home, such as the circle a schedule belongs to.
export function goBack(fallback = "/") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
