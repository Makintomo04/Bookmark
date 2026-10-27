// The pitch (packages/shared/src/pitch.ts): one headline for the web and the mobile welcome screen, and
// none of the old "nobody gets spoiled" positioning left in either, the PWA manifest or the store listings.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/pitch.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PITCH } from "@bookmark/shared/pitch";

const root = join(process.cwd(), "..", "..");
const files = [
  "apps/mobile/src/app/(auth)/index.tsx",
  "apps/web/app/manifest.ts",
  "apps/web/app/components/landing/Landing.tsx",
  "packages/shared/src/pitch.ts",
  ...readdirSync(join(root, "docs/store")).filter((f) => f.endsWith(".md")).map((f) => `docs/store/${f}`),
];
const read = (f: string) => readFileSync(join(root, f), "utf8");

test("the headline is the one-app promise", () => {
  assert.equal(PITCH.headline, "Your reading and your friends, in one app.");
});

test("the web and mobile welcome screens use the shared pitch", () => {
  assert.match(read("apps/mobile/src/app/(auth)/index.tsx"), /PITCH\.headline/);
  assert.match(read("apps/web/app/components/landing/Landing.tsx"), /PITCH\.headline/);
});

test("the old phrases don't come back", () => {
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /nobody gets spoiled/i, f);
    assert.doesNotMatch(text, /group chat for your book/i, f);
  }
});

test("nothing claims spoiler-locking is unique", () => {
  for (const f of files) {
    for (const line of read(f).split("\n")) {
      if (/spoil/i.test(line) && /\b(only app|the only|unique|no other app)\b/i.test(line) && !/^\s*(\/\/|\{\/\*)/.test(line)) {
        assert.fail(`${f}: ${line.trim()}`);
      }
    }
  }
});
