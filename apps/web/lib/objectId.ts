import { randomBytes } from "node:crypto";

// MongoDB ObjectId: 4-byte seconds, 8 random bytes. Generated here when rows are inserted with
// createMany (which doesn't return ids) or chosen up front so a retried batch finds its rows.
// Kept free of "@/" imports so scripts and tests load it with plain Node.
export function newObjectId(at = Date.now()) {
  const seconds = Math.floor(at / 1000).toString(16).padStart(8, "0");
  return seconds + randomBytes(8).toString("hex");
}
