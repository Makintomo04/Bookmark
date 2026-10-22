// Sets up Bookmark Plus in a Stripe account: the products (with their tax code), every price with its
// local-currency amounts, and the customer portal. Safe to run again: it finds what exists by lookup
// key and product metadata, and only adds or fixes what's missing. Works in test or live mode, from
// whichever key it's given.
//
//   node --env-file=.env.local scripts/stripe-setup.ts            (uses STRIPE_SECRET_KEY)
//   node --env-file=.env.local scripts/stripe-setup.ts --check    (reports, changes nothing)
//
// Needs a full secret key (products and portal settings). It prints the STRIPE_PRICE_* lines to put in
// the environment. Prices are tax-inclusive, and Managed Payments needs the product tax code.
//
// One product per tier, as Stripe recommends: Plus (monthly, yearly and the Founding yearly price),
// Patron, and Lifetime. That also keeps the portal happy, which allows one price per interval per product.
import Stripe from "stripe";
import { REGIONAL_PRICES, toMinor, type PricedPlan } from "../lib/regionalPricing.ts";

const PRODUCT_TAX_CODE = "txcd_10103000"; // Software as a service, personal use
const CHECK_ONLY = process.argv.includes("--check");

type ProductKey = "plus" | "patron" | "lifetime";
const PRODUCTS: Record<ProductKey, { name: string; description: string }> = {
  plus: { name: "Bookmark Plus", description: "Recaps, hosting tools and personalisation for Bookmark. Every stat stays free." },
  patron: { name: "Bookmark Plus Patron", description: "Bookmark Plus, paid at a higher price to support Bookmark. Same features, a Patron badge." },
  lifetime: { name: "Bookmark Plus Lifetime", description: "Bookmark Plus for good, with one payment." },
};

type PriceSpec = { plan: PricedPlan; product: ProductKey; lookupKey: string; nickname: string; interval: "month" | "year" | null; env: string };
const PRICES: PriceSpec[] = [
  { plan: "monthly", product: "plus", lookupKey: "bookmark_plus_monthly", nickname: "Plus monthly", interval: "month", env: "STRIPE_PRICE_MONTHLY" },
  { plan: "yearly", product: "plus", lookupKey: "bookmark_plus_yearly", nickname: "Plus yearly", interval: "year", env: "STRIPE_PRICE_YEARLY" },
  { plan: "founding", product: "plus", lookupKey: "bookmark_plus_founding_yearly", nickname: "Founding Reader yearly", interval: "year", env: "STRIPE_PRICE_FOUNDING" },
  { plan: "patron", product: "patron", lookupKey: "bookmark_plus_patron_yearly", nickname: "Patron yearly", interval: "year", env: "STRIPE_PRICE_PATRON" },
  { plan: "lifetime", product: "lifetime", lookupKey: "bookmark_plus_lifetime", nickname: "Lifetime", interval: null, env: "STRIPE_PRICE_LIFETIME" },
];

// Subscribers can switch between these in the portal. Never the Founding price (anyone could switch
// onto it) or lifetime (not a subscription).
const PORTAL_PLANS: PricedPlan[] = ["monthly", "yearly", "patron"];

const localOptions = (plan: PricedPlan) => ({
  gbp: { unit_amount: toMinor(REGIONAL_PRICES.GBP[plan]), tax_behavior: "inclusive" as const },
  eur: { unit_amount: toMinor(REGIONAL_PRICES.EUR[plan]), tax_behavior: "inclusive" as const },
});

const productId = (p: string | Stripe.Product | Stripe.DeletedProduct) => (typeof p === "string" ? p : p.id);

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_")) throw new Error("Set STRIPE_SECRET_KEY to a full secret key (sk_test_… or sk_live_…).");
  const stripe = new Stripe(key);
  console.log(`Stripe ${key.startsWith("sk_live_") ? "LIVE" : "test"} mode${CHECK_ONLY ? " (check only)" : ""}`);

  // Products, found by metadata (the Plus product from before tiers had metadata is found through its prices).
  const all = await stripe.products.list({ limit: 100, active: true });
  const existingPrices = await stripe.prices.list({ lookup_keys: PRICES.map((p) => p.lookupKey), limit: 20, expand: ["data.currency_options"] });
  const products = {} as Record<ProductKey, Stripe.Product>;
  for (const key of Object.keys(PRODUCTS) as ProductKey[]) {
    let product = all.data.find((p) => p.metadata?.app === "bookmark" && (p.metadata?.tier ?? "plus") === key);
    if (!product && key === "plus") {
      const viaPrice = existingPrices.data.find((p) => p.lookup_key === "bookmark_plus_monthly");
      if (viaPrice) product = all.data.find((p) => p.id === productId(viaPrice.product));
    }
    if (!product) {
      if (CHECK_ONLY) { console.log(`missing product ${key}`); continue; }
      product = await stripe.products.create({ ...PRODUCTS[key], tax_code: PRODUCT_TAX_CODE, metadata: { app: "bookmark", tier: key } });
      console.log(`created product ${key} ${product.id}`);
    } else if (!CHECK_ONLY && (product.tax_code !== PRODUCT_TAX_CODE || product.metadata?.tier !== key)) {
      product = await stripe.products.update(product.id, { tax_code: PRODUCT_TAX_CODE, metadata: { app: "bookmark", tier: key } });
    }
    products[key] = product;
    console.log(`product ${key}: ${product.id}`);
  }

  const ids = {} as Record<PricedPlan, string>;
  for (const spec of PRICES) {
    const usd = toMinor(REGIONAL_PRICES.USD[spec.plan]);
    const options = localOptions(spec.plan);
    const product = products[spec.product];
    let price = existingPrices.data.find((p) => p.lookup_key === spec.lookupKey);

    // On the wrong product (or the wrong amount): archive it and start again, taking over the lookup key.
    const misplaced = price && product && productId(price.product) !== product.id;
    const wrongAmount = price && price.unit_amount !== usd;
    if (price && (misplaced || wrongAmount)) {
      if (spec.plan === "founding") {
        console.log(`! ${spec.lookupKey} is ${misplaced ? "on another product" : `${price.unit_amount} cents`}; founders may be on it, so it's left alone.`);
      } else if (!CHECK_ONLY) {
        await stripe.prices.update(price.id, { active: false, lookup_key: `${spec.lookupKey}_archived_${price.id.slice(-6)}` });
        console.log(`archived ${spec.lookupKey} ${price.id} (${misplaced ? "wrong product" : "wrong amount"})`);
        price = undefined;
      } else {
        console.log(`${spec.lookupKey} needs replacing (${misplaced ? "wrong product" : "wrong amount"})`);
      }
    }

    if (!price) {
      if (CHECK_ONLY || !product) { console.log(`missing ${spec.lookupKey}`); continue; }
      price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: usd,
        tax_behavior: "inclusive",
        currency_options: options,
        lookup_key: spec.lookupKey,
        transfer_lookup_key: true,
        nickname: spec.nickname,
        ...(spec.interval && { recurring: { interval: spec.interval } }),
        metadata: { plan: spec.plan },
      });
      console.log(`created ${spec.lookupKey} ${price.id}`);
    } else {
      const current = price.currency_options ?? {};
      const needs = Object.entries(options).filter(([cur, o]) => current[cur]?.unit_amount !== o.unit_amount);
      if (needs.length && !CHECK_ONLY) {
        try {
          price = await stripe.prices.update(price.id, { currency_options: Object.fromEntries(needs) });
          console.log(`updated ${spec.lookupKey} local prices: ${needs.map(([c]) => c).join(", ")}`);
        } catch (e) {
          console.log(`! couldn't update ${spec.lookupKey} local prices: ${(e as Error).message.split("\n")[0]}`);
        }
      } else if (needs.length) {
        console.log(`${spec.lookupKey} needs local prices: ${needs.map(([c]) => c).join(", ")}`);
      }
      if (price.tax_behavior !== "inclusive") console.log(`! ${spec.lookupKey} is not tax-inclusive (${price.tax_behavior}).`);
    }
    ids[spec.plan] = price.id;
  }

  // The customer portal: cancel at period end, switch between the standard prices, no quantities.
  const byProduct = new Map<string, string[]>();
  for (const plan of PORTAL_PLANS) {
    const spec = PRICES.find((p) => p.plan === plan)!;
    const product = products[spec.product];
    if (!product || !ids[plan]) continue;
    byProduct.set(product.id, [...(byProduct.get(product.id) ?? []), ids[plan]]);
  }
  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ["email", "address"] },
    subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "unused", "missing_features", "other"] } },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products: Array.from(byProduct, ([product, prices]) => ({ product, prices, adjustable_quantity: { enabled: false } })),
    },
  };
  const configs = await stripe.billingPortal.configurations.list({ limit: 20 });
  const config = configs.data.find((c) => c.metadata?.app === "bookmark");
  if (CHECK_ONLY) {
    console.log(config ? `portal ${config.id} (default: ${config.is_default})` : "no portal configuration yet");
  } else {
    const saved = config
      ? await stripe.billingPortal.configurations.update(config.id, { features })
      : await stripe.billingPortal.configurations.create({ metadata: { app: "bookmark" }, business_profile: { headline: "Manage your Bookmark Plus subscription" }, features });
    console.log(`portal ${saved.id} (default: ${saved.is_default})${saved.is_default ? "" : ": make it the default in the dashboard"}`);
  }

  console.log("\nEnvironment:");
  for (const spec of PRICES) if (ids[spec.plan]) console.log(`${spec.env}=${ids[spec.plan]}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
