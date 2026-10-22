import type { CSSProperties } from "react";
import type { Plan, ProfileTheme } from "@prisma/client";
import { z } from "zod";
import { planOf, plusSourceOf } from "./entitlements.ts";
import { toHex } from "./colour.ts";

// Personalisation (Bookmark Plus): how the profile page is dressed and what colour the shelf's
// cards use. Stored on User, applied only while the account is on Plus, so a lapsed subscription
// goes back to the look everyone has without losing the choice.

export const PROFILE_THEMES: { id: ProfileTheme; name: string; hint: string }[] = [
  { id: "CLASSIC", name: "Classic", hint: "The page as everyone sees it." },
  { id: "INK", name: "Ink", hint: "Near-black, with your colour glowing from the corner." },
  { id: "TINT", name: "Tint", hint: "A soft wash of your colour behind the page." },
];

export const PROFILE_THEME_IDS = PROFILE_THEMES.map((t) => t.id) as [ProfileTheme, ...ProfileTheme[]];

// The User fields these need. Spread into a Prisma `select`.
export const personalisationSelect = { plan: true, profileTheme: true, shelfCardColour: true, foundingMember: true, lifetime: true, patron: true, compPlusUntil: true } as const;

// The badge beside a paying reader's name, most generous first. Free months earn none.
export type SupporterBadgeKind = "patron" | "lifetime" | "founding" | "supporter";

export interface Personalisation {
  profileTheme: ProfileTheme;
  // #rrggbb, or null to follow favColour.
  shelfCardColour: string | null;
  // Plus accounts show the supporter badge on their profile.
  supporter: boolean;
  // A founder on Plus: the badge reads "Founding Reader".
  founding: boolean;
  badge: SupporterBadgeKind | null;
}

type Stored = {
  plan?: Plan | null;
  profileTheme?: ProfileTheme | null;
  shelfCardColour?: string | null;
  foundingMember?: boolean | null;
  lifetime?: boolean | null;
  patron?: boolean | null;
  compPlusUntil?: Date | string | null;
};

export function personalisationOf(user: Stored, now = new Date()): Personalisation {
  const plus = planOf(user, now) === "PLUS";
  // Paying readers: a subscription or lifetime. Free months unlock the looks but not a supporter badge.
  const source = plusSourceOf(user, now);
  const paying = source === "subscription" || source === "lifetime";
  const badge: SupporterBadgeKind | null = !paying ? null
    : source === "subscription" && user.patron ? "patron"
    : source === "lifetime" ? "lifetime"
    : user.foundingMember ? "founding"
    : "supporter";
  return {
    profileTheme: plus && user.profileTheme ? user.profileTheme : "CLASSIC",
    // Upper case, like the swatches compare against.
    shelfCardColour: plus ? toHex(user.shelfCardColour ?? "")?.toUpperCase() ?? null : null,
    supporter: paying,
    founding: paying && !!user.foundingMember,
    badge,
  };
}

// What the shelf's cover fallbacks and progress bars use: the shelf colour while on Plus, else the profile colour.
export function shelfAccent(user: Stored & { favColour?: string | null }): string | null {
  return personalisationOf(user).shelfCardColour ?? user.favColour ?? null;
}

// Any subset; Edit profile sends what changed with the rest of the profile. A null colour means "same as my profile colour".
export const personalisationSchema = z.object({
  profileTheme: z.enum(PROFILE_THEME_IDS),
  shelfCardColour: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour").transform((c) => c.toUpperCase()).nullable(),
}).partial().strict();
export type PersonalisationInput = z.infer<typeof personalisationSchema>;

// True when the request asks for something only Plus gets (going back to the defaults never does).
export function setsPersonalisation(input: PersonalisationInput): boolean {
  return (!!input.profileTheme && input.profileTheme !== "CLASSIC") || typeof input.shelfCardColour === "string";
}

// The wrapper a themed profile page gets. INK forces the dark palette inside it (Tailwind's `dark`
// class), so cards and text inside keep their contrast in either site theme.
export function profileThemeFrame(theme: ProfileTheme, accent: string | null): { className: string; style?: CSSProperties } | null {
  const colour = toHex(accent ?? "") ?? "#D92D2D";
  if (theme === "INK") {
    return {
      className: "dark rounded-3xl px-3 pb-10 pt-3 sm:px-6 sm:pt-6 text-foreground",
      style: { background: `radial-gradient(circle at 0% 0%, ${colour}66, transparent 55%), radial-gradient(circle at 100% 100%, ${colour}33, transparent 45%), #0B0B0C` },
    };
  }
  if (theme === "TINT") {
    return {
      className: "rounded-3xl px-3 pb-10 pt-3 sm:px-6 sm:pt-6",
      style: { background: `linear-gradient(180deg, ${colour}2e 0%, ${colour}12 45%, transparent 100%)` },
    };
  }
  return null;
}
