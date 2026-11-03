// Profile banners after BOO-99: every profile has one, an uploaded picture or a strip of the reader's colour.
// Old pattern values ("preset:<id>") stay storable, since they're in the database and older app builds still send
// them, but they read as no upload and get the strip.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/banners.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { BANNER_TINT, bannerTint, bannerTintCss, isStorableBanner, uploadedBanner } from "@/lib/banners";
import { mixColour } from "@/lib/colour";

const PICTURE = "https://utfs.io/f/abc.jpg";

test("only an uploaded picture counts as an upload", () => {
  assert.equal(uploadedBanner(PICTURE), PICTURE);
  for (const none of [null, undefined, "", "preset:arches", "preset:dusk", "preset:nonsense"]) assert.equal(uploadedBanner(none), null, String(none));
})

test("old presets, current and retired, are still storable; unknown ones aren't", () => {
  for (const ok of [null, undefined, "", PICTURE, "preset:arches", "preset:plain", "preset:dusk", "preset:spines"]) assert.equal(isStorableBanner(ok), true, String(ok));
  for (const bad of ["preset:nonsense", "preset:", 42, {}]) assert.equal(isStorableBanner(bad), false, String(bad));
})

test("the strip is the reader's colour mixed into the page, as CSS color-mix does", () => {
  assert.equal(mixColour("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixColour("#ffffff", "#D92D2D", 0), "#ffffff");
  assert.equal(mixColour("#ffffff", "#D92D2D", 1), "#d92d2d");
  assert.equal(bannerTint("#D92D2D", "#ffffff"), mixColour("#ffffff", "#D92D2D", BANNER_TINT));
  // A bad colour leaves the page colour alone rather than drawing garbage.
  assert.equal(bannerTint("not a colour", "#141a21"), "#141a21");
  // The web's CSS uses the same share of the colour.
  assert.match(bannerTintCss("#D92D2D"), new RegExp(`#D92D2D ${BANNER_TINT * 100}%`));
})
