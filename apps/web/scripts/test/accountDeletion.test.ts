// Account deletion (lib/accountDeletion.ts): the Stripe subscription is cancelled before anything is
// deleted, nothing is deleted when that fails, and every collection holding a reader's data is cleared.
// The database is a stub that records each call; no real database or Stripe.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/accountDeletion.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SubscriptionCancelError, deleteAccount, type AccountDeletionDeps } from "@/lib/accountDeletion";

const USER_ID = "6560f1c2a1b2c3d4e5f60718";
const AVATAR = "https://utfs.io/f/avatar.png";
const COVER = "https://utfs.io/f/cover.jpg";
const UNUSED_UPLOAD = "https://utfs.io/a/app1/old-photo.jpg";

// Every prisma.<model>.<method>(args) call, in order, plus "stripe.cancel" from the cancel stub.
function recorder() {
  const calls: { op: string; args: unknown }[] = [];
  const tx = new Proxy({}, {
    get: (_, model: string) => new Proxy({}, {
      get: (__, method: string) => async (args: unknown) => {
        calls.push({ op: `${model}.${method}`, args });
        // The profile and shelf the images are read from.
        if (model === "user" && method === "findUnique") return { image: AVATAR, banner: null };
        if (model === "book" && method === "findMany") return [{ coverImage: COVER }, { coverImage: "https://covers.openlibrary.org/b/id/1-L.jpg" }];
        // Their recorded uploads: one is on the shelf too, one isn't anywhere any more.
        if (model === "upload" && method === "findMany") return [{ url: COVER }, { url: UNUSED_UPLOAD }];
        return method === "findMany" ? [{ id: "6560f1c2a1b2c3d4e5f6aaaa" }] : { count: 0 };
      },
    }),
  });
  const db: AccountDeletionDeps["db"] = { $transaction: async (fn) => fn(tx as never) };
  const cancelSubscription = async (id: string) => { calls.push({ op: "stripe.cancel", args: id }); };
  // lib/buddyReadsServer.ts deleteBuddyReadDataFor has its own rules (hosting passes on); here it's a stub.
  const deleteCircleData = async (userId: string, inTx: unknown) => { calls.push({ op: "circles", args: { userId, inTx: inTx === tx } }); };
  return { calls, db, cancelSubscription, deleteCircleData };
}

const ops = (calls: { op: string }[]) => calls.map((c) => c.op);

test("an active subscription is cancelled before anything is deleted", async () => {
  const { calls, db, cancelSubscription, deleteCircleData } = recorder();
  await deleteAccount({ id: USER_ID, stripeSubscriptionId: "sub_123" }, { db, cancelSubscription, deleteCircleData });
  assert.equal(calls[0].op, "stripe.cancel");
  assert.equal(calls[0].args, "sub_123");
  assert.equal(ops(calls).at(-1), "user.delete");
});

test("nothing is deleted when the subscription can't be cancelled", async () => {
  const { calls, db, deleteCircleData } = recorder();
  const failing = async () => { throw new Error("Stripe is down"); };
  await assert.rejects(deleteAccount({ id: USER_ID, stripeSubscriptionId: "sub_123" }, { db, cancelSubscription: failing, deleteCircleData }), SubscriptionCancelError);
  assert.deepEqual(calls, []);

  // Nor when there's a subscription but no way to reach Stripe.
  await assert.rejects(deleteAccount({ id: USER_ID, stripeSubscriptionId: "sub_123" }, { db, deleteCircleData }), SubscriptionCancelError);
  assert.deepEqual(calls, []);
});

test("an account without a subscription is deleted without calling Stripe", async () => {
  const { calls, db, cancelSubscription, deleteCircleData } = recorder();
  await deleteAccount({ id: USER_ID, stripeSubscriptionId: null }, { db, cancelSubscription, deleteCircleData });
  assert.ok(!ops(calls).includes("stripe.cancel"));
  assert.equal(ops(calls).at(-1), "user.delete");
});

test("every model that holds a reader's data is cleared", async () => {
  const { calls, db, cancelSubscription, deleteCircleData } = recorder();
  await deleteAccount({ id: USER_ID }, { db, cancelSubscription, deleteCircleData });

  // Models with a user-id field, read from the schema so a new one can't be forgotten.
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const userFields = /^\s+(userId|ownerId|hostId|inviterId|inviteeId|reporterId|followerId|actorId|blockerId|redeemedById|requesterId|targetId)\s+String/m;
  const models = Array.from(schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm))
    .filter(([, , body]) => userFields.test(body))
    .map(([, name]) => name[0].toLowerCase() + name.slice(1));
  assert.ok(models.length > 15, `expected the schema to have many user-owned models, found ${models.length}`);

  // Reading-circle models are cleared by deleteBuddyReadDataFor, which runs first, inside the transaction.
  const circleModels = models.filter((m) => m.startsWith("buddyRead"));
  assert.deepEqual(calls.find((c) => c.op === "circles")?.args, { userId: USER_ID, inTx: true });
  assert.equal(ops(calls).find((op) => op !== "stripe.cancel"), "circles");

  const touched = new Set(calls.filter((c) => /\.(deleteMany|updateMany|delete)$/.test(c.op)).map((c) => c.op.split(".")[0]));
  const missed = models.filter((m) => !touched.has(m) && !circleModels.includes(m));
  assert.deepEqual(missed, [], `account deletion doesn't clear: ${missed.join(", ")}`);

  // The data that used to be left behind.
  for (const op of ["importJob.deleteMany", "readerTags.deleteMany"]) {
    assert.ok(ops(calls).includes(op), `missing ${op}`);
  }
});

test("the account's images are handed on for deletion once the database is done", async () => {
  const { calls, db, cancelSubscription, deleteCircleData } = recorder();
  const deleteUploads = async (userId: string, urls: string[]) => { calls.push({ op: "uploads", args: { userId, urls } }); };
  await deleteAccount({ id: USER_ID }, { db, cancelSubscription, deleteCircleData, deleteUploads });

  // Read before the rows go, and the files only after the transaction (ending in user.delete) is done.
  const order = ops(calls);
  assert.ok(order.indexOf("user.findUnique") < order.indexOf("book.deleteMany"));
  assert.ok(order.indexOf("book.findMany") < order.indexOf("book.deleteMany"));
  assert.ok(order.indexOf("upload.findMany") < order.indexOf("upload.deleteMany"));
  assert.equal(order.indexOf("uploads"), order.indexOf("user.delete") + 1);
  // Every image URL goes, each once, recorded uploads included; lib/uploadedImages.ts picks out the UploadThing ones.
  assert.deepEqual(calls.find((c) => c.op === "uploads")?.args, { userId: USER_ID, urls: [AVATAR, COVER, "https://covers.openlibrary.org/b/id/1-L.jpg", UNUSED_UPLOAD] });
});

test("no images are deleted when the account isn't", async () => {
  const { calls, deleteCircleData } = recorder();
  const failingDb: AccountDeletionDeps["db"] = { $transaction: async () => { throw new Error("database down"); } };
  const deleteUploads = async () => { calls.push({ op: "uploads", args: null }); };
  await assert.rejects(deleteAccount({ id: USER_ID }, { db: failingDb, deleteCircleData, deleteUploads }));
  assert.ok(!ops(calls).includes("uploads"));
});
