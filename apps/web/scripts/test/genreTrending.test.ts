// A genre's trending row leaves out the subjects it lists in notSubjects (BOO-92). No network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/genreTrending.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { trendingQuery } from "@/lib/openLibrary";

test("Romance trending leaves out classics and mysteries tagged romance", () => {
  const q = trendingQuery("romance");
  assert.match(q, /^subject_key:"romance" language:eng /);
  for (const s of ["classic_literature", "detective_and_mystery_stories"]) assert.ok(q.includes(`-subject_key:"${s}"`), s);
});

test("a genre without exclusions asks for its subject alone", () => {
  assert.equal(trendingQuery("fantasy"), `subject_key:"fantasy" language:eng`);
});
