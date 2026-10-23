// Plus bought in the app (lib/storeBilling.ts and the "store" source in lib/entitlements.ts): RevenueCat's
// subscriber or event becomes the User's store fields, those never touch the Stripe fields, and a store
// subscription counts as Plus until it ends. The database is a stub; RevenueCat isn't called.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/storeBilling.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRevenueCatEvent, storeUpdateFromEvent, storeUpdateFromSubscriber, type RevenueCatSubscriber, type StoreBillingDeps } from "@/lib/storeBilling";
import { canStartCheckout, entitlementsOf, planStatusOf, plusSourceOf } from "@/lib/entitlements";
import { supporterOf } from "@/lib/supporter";

const NOW = new Date("2026-11-01T12:00:00Z");
const USER_ID = "6560f1c2a1b2c3d4e5f60718";
const OTHER_ID = "6560f1c2a1b2c3d4e5f6aaaa";
const FOUNDING = new Set(["plus_founding_yearly"]);

const subscriber = (opts: { expires: string | null; product?: string; period?: string; store?: string; grace?: string }): RevenueCatSubscriber => {
  const product = opts.product ?? "plus_yearly";
  return {
    entitlements: { plus: { expires_date: opts.expires, product_identifier: product, ...(opts.grace && { grace_period_expires_date: opts.grace }) } },
    subscriptions: { [product]: { store: opts.store ?? "app_store", period_type: opts.period ?? "normal", expires_date: opts.expires } },
  };
};

function stubDb(existing = [USER_ID]) {
  const updates: { id: string; data: unknown }[] = [];
  const db: StoreBillingDeps["db"] = {
    user: {
      findMany: async ({ where }) => where.id.in.filter((id) => existing.includes(id)).map((id) => ({ id })),
      update: async ({ where, data }) => { updates.push({ id: where.id, data }); return {}; },
    },
  };
  return { db, updates };
}

test("an active App Store subscription sets the store fields", () => {
  const update = storeUpdateFromSubscriber(subscriber({ expires: "2027-11-01T12:00:00Z" }), { now: NOW });
  assert.deepEqual(update, { storePlusUntil: new Date("2027-11-01T12:00:00Z"), storeName: "APP_STORE", storeProductId: "plus_yearly", storeTrialing: false });
});

test("a Play trial is marked as a trial and doesn't make a founder", () => {
  const update = storeUpdateFromSubscriber(subscriber({ expires: "2026-11-15T12:00:00Z", product: "plus_founding_yearly", period: "trial", store: "play_store" }), { now: NOW, founding: FOUNDING });
  assert.equal(update.storeName, "PLAY_STORE");
  assert.equal(update.storeTrialing, true);
  assert.equal(update.foundingMember, undefined);
});

test("a paid period on the Founding product makes a founder", () => {
  const update = storeUpdateFromSubscriber(subscriber({ expires: "2027-11-01T12:00:00Z", product: "plus_founding_yearly" }), { now: NOW, founding: FOUNDING });
  assert.equal(update.foundingMember, true);
});

test("billing grace keeps Plus until the grace period ends", () => {
  const update = storeUpdateFromSubscriber(subscriber({ expires: "2026-10-30T12:00:00Z", grace: "2026-11-13T12:00:00Z" }), { now: NOW });
  assert.deepEqual(update.storePlusUntil, new Date("2026-11-13T12:00:00Z"));
});

test("no Plus entitlement clears the store plan but keeps the product", () => {
  assert.deepEqual(storeUpdateFromSubscriber({ entitlements: {} }, { now: NOW }), { storePlusUntil: null, storeName: null, storeTrialing: false });
});

test("events without the API: the expiry decides, and other entitlements are ignored", () => {
  const cancelled = storeUpdateFromEvent({ type: "CANCELLATION", expiration_at_ms: Date.parse("2026-12-01T00:00:00Z"), store: "APP_STORE", product_id: "plus_monthly", period_type: "NORMAL" }, { now: NOW });
  assert.deepEqual(cancelled?.storePlusUntil, new Date("2026-12-01T00:00:00Z"));
  const expired = storeUpdateFromEvent({ type: "EXPIRATION", expiration_at_ms: Date.parse("2026-10-01T00:00:00Z"), store: "PLAY_STORE", product_id: "plus_monthly" }, { now: NOW });
  assert.ok(expired && expired.storePlusUntil! < NOW);
  assert.equal(storeUpdateFromEvent({ type: "RENEWAL", entitlement_ids: ["something_else"], expiration_at_ms: Date.parse("2027-01-01T00:00:00Z") }, { now: NOW }), null);
});

test("the handler updates only store fields, from the subscriber as it is now", async () => {
  const { db, updates } = stubDb();
  const outcome = await handleRevenueCatEvent(
    { type: "RENEWAL", app_user_id: USER_ID, expiration_at_ms: Date.parse("2020-01-01T00:00:00Z") },
    { db, fetchSubscriber: async () => subscriber({ expires: "2027-11-01T12:00:00Z" }), now: () => NOW },
  );
  assert.equal(outcome.handled, true);
  assert.equal(updates.length, 1);
  const data = updates[0].data as Record<string, unknown>;
  // The live subscriber wins over the event's stale expiry.
  assert.deepEqual(data.storePlusUntil, new Date("2027-11-01T12:00:00Z"));
  for (const key of Object.keys(data)) assert.ok(key.startsWith("store") || key === "foundingMember", `${key} isn't a store field`);
});

test("a transfer re-reads both accounts; anonymous ids and unknown users are skipped", async () => {
  const { db, updates } = stubDb([USER_ID, OTHER_ID]);
  const seen: string[] = [];
  await handleRevenueCatEvent(
    { type: "TRANSFER", transferred_from: [USER_ID, "$RCAnonymousID:abc"], transferred_to: [OTHER_ID] },
    { db, fetchSubscriber: async (id) => { seen.push(id); return id === OTHER_ID ? subscriber({ expires: "2027-01-01T00:00:00Z" }) : { entitlements: {} }; }, now: () => NOW },
  );
  assert.deepEqual(seen.sort(), [USER_ID, OTHER_ID].sort());
  assert.equal(updates.length, 2);

  const none = stubDb([]);
  const outcome = await handleRevenueCatEvent({ type: "RENEWAL", app_user_id: USER_ID }, { db: none.db, now: () => NOW });
  assert.equal(outcome.handled, false);
  assert.equal(none.updates.length, 0);
});

test("the test event from RevenueCat's dashboard is acknowledged and changes nothing", async () => {
  const { db, updates } = stubDb();
  assert.equal((await handleRevenueCatEvent({ type: "TEST", app_user_id: USER_ID }, { db })).handled, true);
  assert.equal(updates.length, 0);
});

test("a store subscription is Plus until it ends, beside Stripe and free months", () => {
  const store = { plan: "FREE" as const, storePlusUntil: new Date("2026-12-01T00:00:00Z"), storeName: "PLAY_STORE", storeTrialing: true };
  assert.equal(plusSourceOf(store, NOW), "store");
  assert.equal(entitlementsOf(store, NOW).isPlus, true);
  const status = planStatusOf(store, NOW);
  assert.equal(status.store, "PLAY_STORE");
  assert.equal(status.trialing, true);
  assert.deepEqual(status.until, new Date("2026-12-01T00:00:00Z"));
  // No second subscription on the web while the app one runs.
  assert.equal(canStartCheckout(status), false);
  assert.equal(supporterOf(store, NOW).supporter, true);

  const ended = { ...store, storePlusUntil: new Date("2026-10-01T00:00:00Z") };
  assert.equal(plusSourceOf(ended, NOW), null);
  // A Stripe subscription still counts first, so its own status and portal keep working.
  assert.equal(plusSourceOf({ ...store, plan: "PLUS" }, NOW), "subscription");
});
