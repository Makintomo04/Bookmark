// Resend's bounce and complaint webhook (lib/resendWebhook.ts): only correctly signed, recent requests are
// accepted, and only lasting bounces and complaints switch the weekly email off.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/resendWebhook.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { addressesToStop, verifyResendSignature } from "@/lib/resendWebhook";

const KEY = Buffer.from("a test signing key for the webhook");
const SECRET = `whsec_${KEY.toString("base64")}`;
const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const body = JSON.stringify({ type: "email.bounced", data: { to: ["reader@example.com"], bounce: { type: "Permanent" } } });

// Signed the way Resend (Svix) signs it.
const sign = (raw: string, id = "msg_1", timestamp = String(NOW / 1000), key = KEY) => ({
  id,
  timestamp,
  signature: `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64")}`,
});

test("a correctly signed, recent webhook is accepted", () => {
  assert.equal(verifyResendSignature(body, sign(body), SECRET, NOW), true);
  // While a secret rotates, several signatures arrive; any one matching is enough.
  const headers = sign(body);
  assert.equal(verifyResendSignature(body, { ...headers, signature: `v1,bm90IGl0 ${headers.signature}` }, SECRET, NOW), true);
});

test("tampered, unsigned, stale or wrongly keyed webhooks are refused", () => {
  assert.equal(verifyResendSignature(body.replace("reader", "someone"), sign(body), SECRET, NOW), false);
  assert.equal(verifyResendSignature(body, { id: "msg_1", timestamp: String(NOW / 1000), signature: null }, SECRET, NOW), false);
  assert.equal(verifyResendSignature(body, sign(body, "msg_1", String(NOW / 1000 - 600)), SECRET, NOW), false);
  assert.equal(verifyResendSignature(body, sign(body, "msg_1", String(NOW / 1000), Buffer.from("another key")), SECRET, NOW), false);
  assert.equal(verifyResendSignature(body, sign(body), undefined, NOW), false);
  assert.equal(verifyResendSignature(body, { ...sign(body), signature: sign(body).signature.replace("v1,", "v2,") }, SECRET, NOW), false);
});

test("lasting bounces and complaints stop the weekly email; temporary bounces and other events don't", () => {
  assert.deepEqual(addressesToStop({ type: "email.bounced", data: { to: ["a@example.com"], bounce: { type: "Permanent" } } }), ["a@example.com"]);
  // A bounce Resend doesn't classify is treated as lasting.
  assert.deepEqual(addressesToStop({ type: "email.bounced", data: { to: ["a@example.com"] } }), ["a@example.com"]);
  assert.deepEqual(addressesToStop({ type: "email.bounced", data: { to: ["a@example.com"], bounce: { type: "Transient" } } }), []);
  assert.deepEqual(addressesToStop({ type: "email.complained", data: { to: ["a@example.com", "b@example.com"] } }), ["a@example.com", "b@example.com"]);
  assert.deepEqual(addressesToStop({ type: "email.delivered", data: { to: ["a@example.com"] } }), []);
  assert.deepEqual(addressesToStop({ type: "email.complained", data: { to: "a@example.com" } }), []);
});
