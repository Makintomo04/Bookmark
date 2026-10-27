// Mail transport (lib/mailer.ts mailTransportFor): production never falls back to the Ethereal test
// inbox, so verification, password-reset and magic-link emails can't silently vanish.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/mailer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mailTransportFor } from "@/lib/mailer";

test("an SMTP host is used wherever it's set", () => {
  assert.equal(mailTransportFor({ NODE_ENV: "production", EMAIL_SERVER_HOST: "smtp.example.com" }), "smtp");
  assert.equal(mailTransportFor({ NODE_ENV: "development", EMAIL_SERVER_HOST: "smtp.example.com" }), "smtp");
});

test("production without an SMTP host refuses instead of using a test inbox", () => {
  assert.throws(() => mailTransportFor({ NODE_ENV: "production" }), /EMAIL_SERVER_HOST/);
  assert.throws(() => mailTransportFor({ NODE_ENV: "production", EMAIL_SERVER_HOST: "" }), /EMAIL_SERVER_HOST/);
});

test("development without an SMTP host uses the Ethereal test inbox", () => {
  assert.equal(mailTransportFor({ NODE_ENV: "development" }), "ethereal");
  assert.equal(mailTransportFor({ NODE_ENV: "test" }), "ethereal");
});

test("the end-to-end outbox is used outside production only", () => {
  assert.equal(mailTransportFor({ NODE_ENV: "development", MAIL_OUTBOX_DIR: "e2e/.outbox" }), "outbox");
  assert.equal(mailTransportFor({ NODE_ENV: "development", MAIL_OUTBOX_DIR: "e2e/.outbox", EMAIL_SERVER_HOST: "smtp.example.com" }), "outbox");
  assert.equal(mailTransportFor({ NODE_ENV: "production", MAIL_OUTBOX_DIR: "e2e/.outbox", EMAIL_SERVER_HOST: "smtp.example.com" }), "smtp");
  assert.throws(() => mailTransportFor({ NODE_ENV: "production", MAIL_OUTBOX_DIR: "e2e/.outbox" }), /EMAIL_SERVER_HOST/);
});
