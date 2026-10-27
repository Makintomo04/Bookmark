// The words for the pitch, shared by the web's landing page and the mobile welcome screen so they can't
// drift apart. Don't claim spoiler-locked comments are unique: StoryGraph's buddy reads have them too.
export const PITCH = {
  headline: "Your reading and your friends, in one app.",
  lede: "Stop logging every book twice. Track every book with free stats, goals and streaks, and read the next one with friends in a private reading circle.",
  // The web names the app, because its logo isn't right above the lede.
  ledeWeb: "Stop logging every book twice. Bookmark tracks every book with free stats, goals and streaks, and lets you read the next one with friends in a private reading circle.",
  importLine: "Import from Goodreads, StoryGraph, or both, in about a minute.",
} as const;
