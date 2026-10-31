// The paywall's claims (BOO-41): every line on /plus and the app's Plus screen describes something the
// app does today, with the AI numbers taken from the allowances so a cap change can't leave the page behind.
// App Store guideline 3.1.2 and UK consumer law both treat a paywall claim as a promise. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/plusFeatures.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURE_COPY, MONTHLY_ALLOWANCES } from "@/lib/entitlements";
import { FREE, FREE_SOON, PLUS, PLUS_SOON } from "@bookmark/shared/plusFeatures";

const OVERCLAIMS = /\bsoon\b|unlimited|without limits/i;

test("no paywall line says soon, unlimited or without limits", () => {
  for (const line of [...FREE, ...PLUS]) assert.doesNotMatch(line, OVERCLAIMS, line);
});

test("the upgrade prompts never promise unlimited", () => {
  for (const [key, copy] of Object.entries(FEATURE_COPY)) {
    assert.doesNotMatch(copy.title, OVERCLAIMS, `${key} title`);
    assert.doesNotMatch(copy.message, OVERCLAIMS, `${key} message`);
  }
});

// A tripwire: nothing is staged as "coming soon" on the paywall. Delete on purpose when something
// built and switched off is listed there.
test("nothing is listed as coming soon", () => {
  assert.deepEqual(FREE_SOON, []);
  assert.deepEqual(PLUS_SOON, []);
});

test("the AI lines carry the allowances' numbers", () => {
  const { askShelfSearches, recaps } = MONTHLY_ALLOWANCES;
  assert.ok(FREE.some((l) => l.startsWith("Ask the shelf") && l.includes(`${askShelfSearches.free} `)), "free Ask the shelf");
  assert.ok(PLUS.some((l) => l.startsWith("Ask the shelf") && l.includes(`${askShelfSearches.plus} `)), "Plus Ask the shelf");
  assert.ok(PLUS.some((l) => l.startsWith("Catch me up") && l.includes(`${recaps.plus} `)), "Plus Catch me up");
  assert.match(FEATURE_COPY.askShelfSearches.message, new RegExp(`\\b${askShelfSearches.free}\\b.*\\b${askShelfSearches.plus}\\b`));
  assert.match(FEATURE_COPY.recaps.message, new RegExp(`\\b${recaps.plus}\\b`));
});

test("Catch me up is Plus-only, so the free column doesn't list it", () => {
  assert.equal(MONTHLY_ALLOWANCES.recaps.free, 0);
  assert.ok(!FREE.some((l) => /catch me up/i.test(l)));
});

// AI is on by default with Plus (packages/shared/src/preferences.ts), so no Plus line calls it opt-in.
test("no Plus line calls AI opt-in, and Plus says it can be switched off", () => {
  for (const line of PLUS) assert.doesNotMatch(line, /opt-in/i, line);
  assert.ok(PLUS.some((l) => /switch them off any time in Settings/i.test(l)));
});

test("the unbuilt perks are gone", () => {
  for (const line of [...FREE, ...PLUS]) assert.doesNotMatch(line, /roadmap|early access/i, line);
});

// Built in BOO-50: the cover grid and stats cards are free, the extra designs are Plus.
test("Wrap cards are free, their extra designs are Plus", () => {
  assert.ok(FREE.some((l) => /cover grid/i.test(l)));
  assert.ok(PLUS.some((l) => /designs for your Wrap cards/i.test(l)));
});
