import { entitlementsOf } from "./entitlements";

// Sponsored slots for free readers: a publisher pays for a labelled spot (a new release in Discover, a
// pick on a book page), and we serve it ourselves. No ad network, no third-party scripts and no targeting
// by reading history, so the privacy page's "no third-party advertising or tracking cookies" still holds.
// Plus readers never see them. Members of a circle never see them inside the circle either: there's no
// placement there, and there shouldn't be.

export type AdPlacement = "book-page" | "discover";

export interface Sponsorship {
  id: string;
  placement: AdPlacement;
  // Who paid, shown on the card ("Sponsored by …").
  sponsor: string;
  title: string;
  body: string;
  href: string;
  // Inclusive calendar days, YYYY-MM-DD, UTC.
  startsOn: string;
  endsOn: string;
}

// Booked campaigns. Empty until the first one is sold; add a row per booking.
export const SPONSORSHIPS: Sponsorship[] = [];

// The reader's plan decides: free (or signed out) sees sponsored slots, Plus never does.
export function seesSponsored(viewer: Parameters<typeof entitlementsOf>[0] | null | undefined, now = new Date()): boolean {
  return !entitlementsOf(viewer ?? {}, now).isPlus;
}

// The campaign running in a placement today, if any. With two booked at once, the one that started first.
export function activeSponsorship(placement: AdPlacement, today: string, booked: Sponsorship[] = SPONSORSHIPS): Sponsorship | null {
  return booked
    .filter((s) => s.placement === placement && s.startsOn <= today && today <= s.endsOn)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ?? null;
}
