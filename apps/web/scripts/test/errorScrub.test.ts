// Error reports carry no personal data (BOO-54): the shared scrubber the web and mobile Sentry setups run on
// every event and breadcrumb. No Sentry, no network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/errorScrub.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FILTERED, scrubBreadcrumb, scrubEvent, scrubString } from "@bookmark/shared/errorScrub";

test("emails, bearer tokens, JWTs and secret query parameters are taken out of any text", () => {
  assert.equal(scrubString("no account for reader@example.co.uk"), `no account for ${FILTERED}`);
  assert.equal(scrubString("Authorization: Bearer abc.def-123"), `Authorization: Bearer ${FILTERED}`);
  assert.equal(scrubString("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl rejected"), `token ${FILTERED} rejected`);
  assert.equal(
    scrubString("GET /verify-email?token=s3cret&next=/home&email=a%40b.com"),
    `GET /verify-email?token=${FILTERED}&next=/home&email=${FILTERED}`,
  );
  assert.equal(scrubString("Cannot read properties of undefined (reading 'title')"), "Cannot read properties of undefined (reading 'title')");
});

test("review and comment text inside an error message is filtered, as Prisma prints a failed call's arguments", () => {
  const prisma = `Invalid \`prisma.book.update()\` invocation:\n{\n  data: {\n    review: "I cried at the ending, don't tell Sam",\n    rating: 5\n  }\n}`;
  const scrubbed = scrubString(prisma);
  assert.ok(!scrubbed.includes("cried"));
  assert.ok(scrubbed.includes(`review: "${FILTERED}"`));
  assert.ok(scrubbed.includes("rating: 5"));
  assert.ok(!scrubString(`{"comment":"spoiler: he dies","bookId":"1"}`).includes("he dies"));
});

test("an event keeps only the user's id, safe headers and no cookies or body", () => {
  const event = {
    message: "Failed for reader@example.com",
    user: { id: "65f1c0ffee", email: "reader@example.com", username: "reader", ip_address: "203.0.113.9" },
    request: {
      url: "https://bookmark.app/api/books?token=abc",
      method: "POST",
      headers: { "User-Agent": "Mozilla/5.0", Authorization: "Bearer abc", Cookie: "next-auth.session-token=xyz", "x-client": "ios" },
      cookies: { "next-auth.session-token": "xyz" },
      data: { review: "My thoughts", email: "reader@example.com" },
    },
    exception: { values: [{ type: "Error", value: "Couldn't email reader@example.com" }] },
  };
  const out = scrubEvent(event);
  assert.deepEqual(out.user, { id: "65f1c0ffee" });
  assert.equal(out.request.url, `https://bookmark.app/api/books?token=${FILTERED}`);
  assert.equal(out.request.method, "POST");
  assert.deepEqual(out.request.headers, { "User-Agent": "Mozilla/5.0", "x-client": "ios" });
  assert.equal("cookies" in out.request, false);
  assert.equal("data" in out.request, false);
  assert.equal(out.message, `Failed for ${FILTERED}`);
  assert.equal(out.exception.values[0].value, `Couldn't email ${FILTERED}`);
  assert.equal(event.user.email, "reader@example.com", "the input isn't changed");
});

test("sensitive fields are filtered at any depth, in extras, contexts and breadcrumbs", () => {
  const out = scrubEvent({
    extra: { book: { id: "b1", title: "Piranesi", review: "Loved it", note: "for Jo" }, accessToken: "t", password: "p" },
    contexts: { state: { form: { bio: "I live in Leeds", username: "x" } } },
  });
  assert.deepEqual(out.extra, { book: { id: "b1", title: "Piranesi", review: FILTERED, note: FILTERED }, accessToken: FILTERED, password: FILTERED });
  assert.equal(out.contexts.state.form.bio, FILTERED);

  const crumb = scrubBreadcrumb({ category: "fetch", data: { url: "/api/auth/callback?code=123&state=abc", body: '{"comment":"hi"}', status_code: 500 } });
  assert.deepEqual(crumb.data, { url: `/api/auth/callback?code=${FILTERED}&state=${FILTERED}`, body: FILTERED, status_code: 500 });
});

test("an event with no user or request is passed through, scrubbed", () => {
  const out = scrubEvent({ level: "error", tags: { route: "/api/books" }, breadcrumbs: [{ message: "signed in as a@b.co" }] });
  assert.deepEqual(out, { level: "error", tags: { route: "/api/books" }, breadcrumbs: [{ message: `signed in as ${FILTERED}` }] });
});
