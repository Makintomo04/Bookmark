// The phone's "open the web signed in" link (lib/appHandoff.ts, BOO-88): where it may send someone, and
// that the token rides in the fragment, never the query.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/appHandoff.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { appHandoffPath, consumeAppHandoff, handoffNext } from "@/lib/appHandoff";

test("only a path on this site; anything else goes home", () => {
  assert.equal(handoffNext("/staff"), "/staff");
  assert.equal(handoffNext("/staff/reports?tab=open"), "/staff/reports?tab=open");
  assert.equal(handoffNext("https://evil.example/staff"), "/");
  assert.equal(handoffNext("//evil.example"), "/");
  assert.equal(handoffNext("/\\evil.example"), "/");
  assert.equal(handoffNext(undefined), "/");
  assert.equal(handoffNext(42), "/");
});

test("the token is in the fragment, so it's never sent to a server", () => {
  const path = appHandoffPath("a".repeat(64), "/staff");
  assert.ok(path.startsWith("/signin/app#"));
  assert.ok(!path.includes("?"));
  const params = new URLSearchParams(path.split("#")[1]);
  assert.equal(params.get("token"), "a".repeat(64));
  assert.equal(params.get("next"), "/staff");
});

test("a token that isn't one is turned away before the database is asked", async () => {
  assert.equal(await consumeAppHandoff(""), null);
  assert.equal(await consumeAppHandoff("not-a-token"), null);
  assert.equal(await consumeAppHandoff("A".repeat(64)), null);
});
