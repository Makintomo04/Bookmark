// Free Plus granted by an admin (lib/staffUsers.ts grantPlus): how compPlusUntil moves, and that an
// open-ended grant reads as Plus. Pure: no database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/staffPlus.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMP_INDEFINITE, grantedCompUntil, isIndefiniteComp, planStatusOf, plusSourceOf } from "@/lib/entitlements";

const now = new Date("2026-10-26T12:00:00Z");

test("a grant adds months from now, or from the end of free Plus still left", () => {
  assert.equal(grantedCompUntil(null, "1m", now).toISOString(), "2026-11-26T12:00:00.000Z");
  assert.equal(grantedCompUntil(new Date("2026-01-01"), "1m", now).toISOString(), "2026-11-26T12:00:00.000Z", "an expired grant starts from now");
  assert.equal(grantedCompUntil("2026-12-01T00:00:00Z", "1y", now).toISOString(), "2027-12-01T00:00:00.000Z");
});

test("an open-ended grant is Plus with no end date, and stays open-ended", () => {
  const until = grantedCompUntil(null, "indefinite", now);
  assert.equal(until.getTime(), COMP_INDEFINITE.getTime());
  assert.equal(isIndefiniteComp(until), true);
  assert.equal(isIndefiniteComp(new Date("2030-01-01")), false);
  assert.equal(isIndefiniteComp(null), false);
  assert.equal(grantedCompUntil(COMP_INDEFINITE, "1m", now).getTime(), COMP_INDEFINITE.getTime(), "a month on top doesn't shorten it");
  assert.equal(plusSourceOf({ plan: "FREE", compPlusUntil: until }, now), "comp");
  assert.equal(planStatusOf({ plan: "FREE", compPlusUntil: until }, now).plan, "PLUS");
});

test("a paid plan wins over free Plus as the source", () => {
  assert.equal(plusSourceOf({ plan: "PLUS", compPlusUntil: COMP_INDEFINITE }, now), "subscription");
});
