import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { PLUS_PRICING, canStartCheckout, planStatusOf } from "@/lib/entitlements";
import { currentFoundingStatus, currentLifetimeStatus } from "@/lib/entitlementsServer";
import { canRedeemGift } from "@/lib/plusRewards";
import { REGIONAL_PRICES, currencyForCountry, type PlusCurrency } from "@/lib/regionalPricing";
import { allowanceStatus, usageAccountOf } from "@/lib/ai/usage";

const CURRENCIES: PlusCurrency[] = ["USD", "GBP", "EUR"];
const serialiseWindow = (w: { open: boolean; remaining: number; closesAt: Date | null }) => ({ open: w.open, remaining: w.remaining, closesAt: w.closesAt?.toISOString() ?? null });

// What the /plus page knows, for the mobile app's Plus screen: the reader's plan and where it comes
// from, this month's AI allowances, and whether the Founding Reader price is still open. Store prices
// come from the App Store or Google Play in the app; the web prices here are for "you subscribed on the
// web" copy. Public, like /plus: signed out, there's no status.
export async function GET(req: Request) {
  const [user, founding, lifetime] = await Promise.all([getCurrentUser(), currentFoundingStatus(), currentLifetimeStatus()]);
  const asked = new URL(req.url).searchParams.get("currency")?.toUpperCase() as PlusCurrency | undefined;
  const currency = asked && CURRENCIES.includes(asked) ? asked : currencyForCountry(req.headers.get("x-vercel-ip-country"));

  const status = user ? planStatusOf(user) : null;
  const allowances = user
    ? await (async () => {
        const account = usageAccountOf(user);
        const [askShelfSearches, recaps] = await Promise.all([
          allowanceStatus(user.id, "askShelfSearches", { account }),
          allowanceStatus(user.id, "recaps", { account }),
        ]);
        return { askShelfSearches, recaps };
      })()
    : null;

  return NextResponse.json({
    status: status && { ...status, until: status.until?.toISOString() ?? null, compUntil: status.compUntil?.toISOString() ?? null },
    canSubscribe: status ? canStartCheckout(status) : true,
    canRedeemGift: !!user && canRedeemGift(user),
    allowances,
    founding: serialiseWindow(founding),
    lifetime: serialiseWindow(lifetime),
    trialDays: PLUS_PRICING.trialDays,
    currency,
    webPrices: REGIONAL_PRICES[currency],
  });
}
