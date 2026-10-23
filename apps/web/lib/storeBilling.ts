// Plus bought in the iOS or Android app. RevenueCat handles the App Store and Google Play purchases and
// tells us through its webhook (app/api/billing/revenuecat); this turns that into the User's store fields
// (storePlusUntil and friends), which lib/entitlements.ts reads as the "store" source of Plus. The Stripe
// fields are never touched, so a web subscription and an app one can't end each other.
//
// The app logs in to RevenueCat with the Bookmark user id, so app_user_id is the User id.
// Like Stripe's, RevenueCat's events can arrive out of order, so when the secret API key is set the
// subscriber is read as it is now, and the event's own copy is only the fallback.
//
// Pure apart from the database and RevenueCat calls handed in (scripts/test/storeBilling.test.ts).

export const PLUS_ENTITLEMENT = process.env.REVENUECAT_ENTITLEMENT || "plus";

// A purchase that never expires (RevenueCat gives no expiry): treated as running for good.
const NEVER = new Date("2100-01-01T00:00:00Z");

export type StoreUpdate = {
  storePlusUntil: Date | null;
  storeName?: string | null;
  storeProductId?: string;
  storeTrialing: boolean;
  foundingMember?: true;
};

// The parts of RevenueCat's GET /v1/subscribers/{id} answer this reads.
export interface RevenueCatSubscriber {
  entitlements?: Record<string, { expires_date?: string | null; grace_period_expires_date?: string | null; product_identifier?: string } | undefined>;
  subscriptions?: Record<string, { store?: string; period_type?: string; expires_date?: string | null } | undefined>;
}

// The parts of a webhook event this reads (https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).
export interface RevenueCatEvent {
  type: string;
  id?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
  product_id?: string;
  period_type?: string;
  store?: string;
  expiration_at_ms?: number | null;
  entitlement_ids?: string[] | null;
  environment?: string;
}

const storeNameOf = (store: string | undefined) => (store === "PLAY_STORE" || store === "play_store" ? "PLAY_STORE" : store === "APP_STORE" || store === "app_store" ? "APP_STORE" : store ? store.toUpperCase() : null);
const dateOf = (iso: string | null | undefined) => (iso ? new Date(iso) : null);

// Founding Reader products in the stores (STORE_PRODUCTS_FOUNDING, comma separated). A paid period on one
// marks the account as a founder, as the Founding Stripe price does; trials don't count.
export function foundingProducts(raw = process.env.STORE_PRODUCTS_FOUNDING) {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export function storeUpdateFromSubscriber(subscriber: RevenueCatSubscriber, opts: { now?: Date; founding?: Set<string> } = {}): StoreUpdate {
  const now = opts.now ?? new Date();
  const entitlement = subscriber.entitlements?.[PLUS_ENTITLEMENT];
  if (!entitlement) return { storePlusUntil: null, storeName: null, storeTrialing: false };
  const productId = entitlement.product_identifier;
  const subscription = productId ? subscriber.subscriptions?.[productId] : undefined;
  const until = dateOf(entitlement.grace_period_expires_date) ?? (entitlement.expires_date === null ? NEVER : dateOf(entitlement.expires_date)) ?? NEVER;
  const active = until.getTime() > now.getTime();
  const trialing = active && subscription?.period_type === "trial";
  const founder = active && !!productId && !!opts.founding?.has(productId) && subscription?.period_type !== "trial";
  return {
    storePlusUntil: until,
    storeName: storeNameOf(subscription?.store),
    ...(productId && { storeProductId: productId }),
    storeTrialing: trialing,
    ...(founder && { foundingMember: true as const }),
  };
}

// Without the API key: what the event itself says. Every event carries the period's expiry, which is
// what decides access: a cancellation keeps Plus until then, an expiry or a refund puts it in the past.
export function storeUpdateFromEvent(event: RevenueCatEvent, opts: { now?: Date; founding?: Set<string> } = {}): StoreUpdate | null {
  if (event.entitlement_ids && !event.entitlement_ids.includes(PLUS_ENTITLEMENT)) return null;
  const now = opts.now ?? new Date();
  const until = event.expiration_at_ms ? new Date(event.expiration_at_ms) : event.type === "EXPIRATION" ? now : NEVER;
  const active = until.getTime() > now.getTime();
  const founder = active && !!event.product_id && !!opts.founding?.has(event.product_id) && event.period_type !== "TRIAL";
  return {
    storePlusUntil: until,
    storeName: storeNameOf(event.store),
    ...(event.product_id && { storeProductId: event.product_id }),
    storeTrialing: active && event.period_type === "TRIAL",
    ...(founder && { foundingMember: true as const }),
  };
}

export interface StoreBillingDeps {
  db: {
    user: {
      findMany(args: { where: { id: { in: string[] } }; select: { id: true } }): Promise<{ id: string }[]>;
      update(args: { where: { id: string }; data: StoreUpdate }): Promise<unknown>;
    };
  };
  // RevenueCat's subscriber as it is now. Undefined when REVENUECAT_SECRET_API_KEY isn't set.
  fetchSubscriber?: (appUserId: string) => Promise<RevenueCatSubscriber | null>;
  founding?: Set<string>;
  now?: () => Date;
}

export interface StoreOutcome {
  handled: boolean;
  userIds: string[];
  note: string;
}

const isObjectId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);

export async function handleRevenueCatEvent(event: RevenueCatEvent, deps: StoreBillingDeps): Promise<StoreOutcome> {
  if (event.type === "TEST") return { handled: true, userIds: [], note: "test event" };
  const now = (deps.now ?? (() => new Date()))();

  // A transfer moves the purchase between accounts (a phone's Apple ID signed in to a second Bookmark
  // account), so both sides are re-read. Anonymous RevenueCat ids ($RCAnonymousID:…) are never users.
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []), ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])];
  const ids = Array.from(new Set(candidates.filter(isObjectId)));
  if (ids.length === 0) return { handled: false, userIds: [], note: "no Bookmark user in the event" };
  const users = await deps.db.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (users.length === 0) return { handled: false, userIds: [], note: "no account for the event" };

  const touched: string[] = [];
  for (const { id } of users) {
    let update: StoreUpdate | null;
    if (deps.fetchSubscriber) {
      const subscriber = await deps.fetchSubscriber(id);
      update = subscriber ? storeUpdateFromSubscriber(subscriber, { now, founding: deps.founding }) : null;
    } else if (event.type === "TRANSFER") {
      // Without the API, a transfer can't say who holds the purchase now; the next renewal event will.
      update = null;
    } else {
      update = storeUpdateFromEvent(event, { now, founding: deps.founding });
    }
    if (!update) continue;
    await deps.db.user.update({ where: { id }, data: update });
    touched.push(id);
  }
  return { handled: touched.length > 0, userIds: touched, note: `${event.type}: ${touched.length} account(s) updated` };
}

// RevenueCat's REST API, from the secret key. Null when it isn't configured.
export function revenueCatApi(secret = process.env.REVENUECAT_SECRET_API_KEY) {
  if (!secret) return null;
  const headers = { authorization: `Bearer ${secret}`, accept: "application/json" };
  const url = (appUserId: string) => `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`;
  return {
    async fetchSubscriber(appUserId: string): Promise<RevenueCatSubscriber | null> {
      const res = await fetch(url(appUserId), { headers, signal: AbortSignal.timeout(8000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`RevenueCat answered ${res.status}`);
      return ((await res.json()) as { subscriber?: RevenueCatSubscriber }).subscriber ?? null;
    },
    // Account deletion: removes the customer and their purchase history from RevenueCat. Store
    // subscriptions themselves can only be cancelled by the reader, in the store.
    async deleteSubscriber(appUserId: string) {
      const res = await fetch(url(appUserId), { method: "DELETE", headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok && res.status !== 404) throw new Error(`RevenueCat answered ${res.status}`);
    },
  };
}
