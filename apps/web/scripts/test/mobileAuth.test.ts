// Mobile sign-in sessions (lib/mobileAuth.ts): access tokens are read back only with the mobile claim
// and before they expire, refresh tokens rotate and work once, a replayed old token ends the session,
// and an expired session can't be refreshed. The store is an in-memory stub.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/mobileAuth.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  bearerUserId,
  endMobileSession,
  hashRefreshToken,
  refreshMobileSession,
  startMobileSession,
  type MobileSessionStore,
} from "@/lib/mobileAuth";

const SECRET = "test-secret-for-mobile-auth";
const USER = { id: "6560f1c2a1b2c3d4e5f60718", email: "reader@example.com" };

function memoryStore() {
  const rows = new Map<string, { id: string; userId: string; tokenHash: string; previousHash: string | null; expiresAt: Date }>();
  let next = 1;
  const store: MobileSessionStore = {
    async create(data) {
      const id = String(next++);
      rows.set(id, { id, userId: data.userId, tokenHash: data.tokenHash, previousHash: null, expiresAt: data.expiresAt });
      return { id };
    },
    async findByHash(hash) {
      return Array.from(rows.values()).find((r) => r.tokenHash === hash) ?? null;
    },
    async findByPreviousHash(hash) {
      return Array.from(rows.values()).find((r) => r.previousHash === hash) ?? null;
    },
    async rotate(id, fromHash, data) {
      const row = rows.get(id);
      if (!row || row.tokenHash !== fromHash) return false;
      Object.assign(row, data);
      return true;
    },
    async delete(id) {
      rows.delete(id);
    },
  };
  return { store, rows };
}

test("an access token names its user and lasts fifteen minutes", async () => {
  const { store } = memoryStore();
  const tokens = await startMobileSession(USER, "ios", store, { secret: SECRET });
  assert.equal(tokens.expiresIn, ACCESS_TOKEN_TTL_SECONDS);
  assert.equal(await bearerUserId(`Bearer ${tokens.accessToken}`, SECRET), USER.id);
});

test("only the refresh token's hash is stored", async () => {
  const { store, rows } = memoryStore();
  const tokens = await startMobileSession(USER, null, store, { secret: SECRET });
  const [row] = Array.from(rows.values());
  assert.notEqual(row.tokenHash, tokens.refreshToken);
  assert.equal(row.tokenHash, hashRefreshToken(tokens.refreshToken));
});

test("bearer tokens are refused without the mobile claim, when forged, or when malformed", async () => {
  // A web session token, signed with the same secret: not accepted as a bearer token.
  const web = await encode({ token: { sub: USER.id, email: USER.email }, secret: SECRET });
  assert.equal(await bearerUserId(`Bearer ${web}`, SECRET), null);

  const { store } = memoryStore();
  const tokens = await startMobileSession(USER, null, store, { secret: SECRET });
  assert.equal(await bearerUserId(`Bearer ${tokens.accessToken}`, "another-secret"), null);
  assert.equal(await bearerUserId(tokens.accessToken, SECRET), null);
  assert.equal(await bearerUserId(null, SECRET), null);
});

test("an expired access token is refused", async () => {
  const expired = await encode({ token: { sub: USER.id, mobile: true }, secret: SECRET, maxAge: -60 });
  assert.equal(await bearerUserId(`Bearer ${expired}`, SECRET), null);
});

test("refreshing rotates the token, and each refresh token works once", async () => {
  const { store } = memoryStore();
  const first = await startMobileSession(USER, "android", store, { secret: SECRET });
  const refreshed = await refreshMobileSession(first.refreshToken, store, { secret: SECRET });
  assert.ok(refreshed.ok);
  assert.notEqual(refreshed.tokens.refreshToken, first.refreshToken);
  assert.equal(await bearerUserId(`Bearer ${refreshed.tokens.accessToken}`, SECRET), USER.id);

  const again = await refreshMobileSession(refreshed.tokens.refreshToken, store, { secret: SECRET });
  assert.ok(again.ok);
});

test("using a rotated refresh token again ends the session", async () => {
  const { store, rows } = memoryStore();
  const first = await startMobileSession(USER, null, store, { secret: SECRET });
  const refreshed = await refreshMobileSession(first.refreshToken, store, { secret: SECRET });
  assert.ok(refreshed.ok);

  const replay = await refreshMobileSession(first.refreshToken, store, { secret: SECRET });
  assert.deepEqual(replay, { ok: false, reason: "reused" });
  assert.equal(rows.size, 0);
  // The thief's copy and the phone's copy are both dead now.
  const phone = await refreshMobileSession(refreshed.tokens.refreshToken, store, { secret: SECRET });
  assert.deepEqual(phone, { ok: false, reason: "invalid" });
});

test("a session unused for longer than its lifetime can't be refreshed", async () => {
  const { store, rows } = memoryStore();
  const start = new Date("2026-01-01T00:00:00Z");
  const tokens = await startMobileSession(USER, null, store, { secret: SECRET, now: start });
  const later = new Date(start.getTime() + REFRESH_TOKEN_TTL_MS + 1000);
  assert.deepEqual(await refreshMobileSession(tokens.refreshToken, store, { secret: SECRET, now: later }), { ok: false, reason: "expired" });
  assert.equal(rows.size, 0);
});

test("refreshing pushes the session's end out again", async () => {
  const { store, rows } = memoryStore();
  const start = new Date("2026-01-01T00:00:00Z");
  const tokens = await startMobileSession(USER, null, store, { secret: SECRET, now: start });
  const later = new Date(start.getTime() + REFRESH_TOKEN_TTL_MS - 1000);
  assert.ok((await refreshMobileSession(tokens.refreshToken, store, { secret: SECRET, now: later })).ok);
  const [row] = Array.from(rows.values());
  assert.equal(row.expiresAt.getTime(), later.getTime() + REFRESH_TOKEN_TTL_MS);
});

test("signing out deletes the session; unknown tokens are fine", async () => {
  const { store, rows } = memoryStore();
  const tokens = await startMobileSession(USER, null, store, { secret: SECRET });
  await endMobileSession("not-a-real-token", store);
  assert.equal(rows.size, 1);
  await endMobileSession(tokens.refreshToken, store);
  assert.equal(rows.size, 0);
  assert.deepEqual(await refreshMobileSession(tokens.refreshToken, store, { secret: SECRET }), { ok: false, reason: "invalid" });
});
