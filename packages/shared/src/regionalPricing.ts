import { FOUNDING, LIFETIME, PATRON, PLUS_PRICING } from "./entitlements";

// Plus in the reader's own currency. Fixed, rounded, tax-inclusive prices, each at or below the US
// price once converted, so no reader pays more than a US reader. Stripe holds the same amounts as
// currency_options on each price (scripts/stripe-setup.ts), and Checkout charges the local one.
//
// The rates are the ones these prices were checked against (Aug/Sep 2026 quotes, with a small margin).
// scripts/test/billing.test.ts fails if a price goes over parity at them; recheck before launch.
export const ASSUMED_USD_PER = { GBP: 1.36, EUR: 1.17 } as const;

export type PlusCurrency = "USD" | "GBP" | "EUR";
export type PricedPlan = "monthly" | "yearly" | "founding" | "patron" | "lifetime";

export const REGIONAL_PRICES: Record<PlusCurrency, Record<PricedPlan, number>> = {
  USD: { monthly: PLUS_PRICING.monthly, yearly: PLUS_PRICING.yearly, founding: FOUNDING.yearly, patron: PATRON.yearly, lifetime: LIFETIME.price },
  GBP: { monthly: 2.89, yearly: 21.99, founding: 17.99, patron: 35.99, lifetime: 57.99 },
  EUR: { monthly: 3.39, yearly: 24.99, founding: 20.99, patron: 41.99, lifetime: 66.99 },
};

const SYMBOL: Record<PlusCurrency, string> = { USD: "$", GBP: "£", EUR: "€" };

// Eurozone members (ISO 3166 alpha-2), as Vercel's x-vercel-ip-country reports them.
const EUROZONE = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES", "BG"]);

// The currency to show a visitor from this country. Everyone outside the UK and the eurozone sees USD.
export function currencyForCountry(country: string | null | undefined): PlusCurrency {
  const code = (country ?? "").toUpperCase();
  if (code === "GB" || code === "UK" || code === "IM" || code === "JE" || code === "GG") return "GBP";
  if (EUROZONE.has(code)) return "EUR";
  return "USD";
}

export function priceIn(currency: PlusCurrency, plan: PricedPlan): number {
  return REGIONAL_PRICES[currency][plan];
}

// "$29.99", "£21.99", "€24.99"; whole amounts without decimals ("$79").
export function formatPrice(currency: PlusCurrency, amount: number): string {
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${SYMBOL[currency]}${text}`;
}

// Minor units for Stripe (cents, pence).
export const toMinor = (amount: number) => Math.round(amount * 100);
