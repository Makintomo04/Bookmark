// Bookmark's colour tokens (design system: claude.ai/artifact/GGo9txbjNoLtEWFUMcUnr8), as HSL channel
// triples like apps/web/app/globals.css. The web reads them from CSS variables; the mobile app imports
// them from here. scripts/test/tokens.test.ts in apps/web fails if the two drift apart.

export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  destructive: string;
  "destructive-foreground": string;
  danger: string;
  "brand-text": string;
  border: string;
  input: string;
  ring: string;
};

export const light: ThemeTokens = {
  background: "0 0% 100%",
  foreground: "0 0% 3.9%",
  card: "0 0% 100%",
  "card-foreground": "0 0% 3.9%",
  popover: "0 0% 98%",
  "popover-foreground": "0 0% 3.9%",
  primary: "0 69.4% 51.4%",
  "primary-foreground": "0 0% 100%",
  secondary: "0 0% 96.1%",
  "secondary-foreground": "0 0% 3.9%",
  muted: "0 0% 96.1%",
  "muted-foreground": "0 0% 42%",
  accent: "0 0% 96.1%",
  "accent-foreground": "0 0% 3.9%",
  destructive: "0 73.7% 41.8%",
  "destructive-foreground": "0 0% 100%",
  danger: "0 73.7% 41.8%",
  "brand-text": "0 66.7% 46.1%",
  border: "0 0% 89.8%",
  input: "0 0% 54.1%",
  ring: "0 0% 32.2%",
};

export const dark: ThemeTokens = {
  background: "0 0% 3.9%",
  foreground: "0 0% 98%",
  card: "0 0% 3.9%",
  "card-foreground": "0 0% 98%",
  popover: "0 0% 9%",
  "popover-foreground": "0 0% 98%",
  primary: "0 69.4% 51.4%",
  "primary-foreground": "0 0% 100%",
  secondary: "0 0% 14.9%",
  "secondary-foreground": "0 0% 98%",
  muted: "0 0% 14.9%",
  "muted-foreground": "0 0% 63.9%",
  accent: "0 0% 14.9%",
  "accent-foreground": "0 0% 98%",
  destructive: "0 73.7% 41.8%",
  "destructive-foreground": "0 0% 100%",
  danger: "0 90.7% 70.8%",
  "brand-text": "0 86.8% 59%",
  border: "0 0% 14.9%",
  input: "0 0% 42%",
  ring: "0 0% 83.1%",
};

// One red per role: `brand` is the mark (logo, your progress, stars) and never sits under white text,
// `fill` is buttons (white text passes 4.5:1 on it), `text` is red words and links (per theme, above).
export const brand = {
  DEFAULT: "#F13C3C",
  fill: "#D92D2D",
  "fill-hover": "#C42727",
} as const;

// Base corner radius in px (--radius: 0.5rem); md and sm are 2px and 4px less.
export const radius = 8;

export const hsl = (channels: string) => `hsl(${channels.split(" ").join(", ")})`;
