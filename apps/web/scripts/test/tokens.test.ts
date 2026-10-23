// The colour tokens in packages/shared/src/tokens.ts (what the mobile app styles with) match the CSS
// variables in app/globals.css (what the web styles with), in both themes.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/tokens.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brand, dark, hex, light } from "@bookmark/shared/tokens";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function variables(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block not found in globals.css`);
  const block = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const [, name, value] of Array.from(block.matchAll(/--([a-z-]+):\s*([^;]+);/g))) out[name] = value.trim();
  delete out.radius;
  return out;
}

test("light tokens match :root in globals.css", () => {
  assert.deepEqual({ ...light }, variables(":root"));
});

test("dark tokens match .dark in globals.css", () => {
  assert.deepEqual({ ...dark }, variables(".dark"));
});

test("hex converts the HSL tokens the mobile app styles with", () => {
  // --primary is the brand fill, which the design system also gives as hex.
  assert.equal(hex(light.primary), brand.fill.toLowerCase());
  assert.equal(hex("0 0% 100%"), "#ffffff");
  assert.equal(hex(dark.background), "#0a0a0a");
});
