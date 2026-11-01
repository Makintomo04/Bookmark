// People you may know (BOO-81): the scoring, the reason line, and every rule about who may be suggested
// and what a reason may give away, without a database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/peopleSuggest.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { feedShowsSuggestions, followedByText, rankSuggestions, suggestionReason, suggestionScore, type SuggestionSignals } from "@bookmark/shared/peopleSuggest";
import { storedSetting, preferencesOf } from "@bookmark/shared/preferences";
import { assembleSuggestions, type CandidateUser, type SuggestionInput } from "@/lib/peopleSuggestRules";

const none: SuggestionSignals = { followsYou: false, clubs: [], circles: [], mutuals: [], inactive: false };
const club = (name: string, size = 6) => ({ name, size });
const circle = (title: string, active: boolean, size = 4) => ({ title, active, size });
const now = new Date("2026-10-31T12:00:00Z");
const old = new Date("2025-01-01T00:00:00Z");

test("each signal scores as weighted, with caps", () => {
  assert.equal(suggestionScore(none), 0);
  assert.equal(suggestionScore({ ...none, followsYou: true }), 40);
  assert.equal(suggestionScore({ ...none, clubs: [club("A"), club("B"), club("C")] }), 60);
  assert.equal(suggestionScore({ ...none, mutuals: ["a", "b", "c", "d", "e", "f", "g"] }), 50);
  // Six months quiet halves it.
  assert.equal(suggestionScore({ ...none, followsYou: true, inactive: true }), 20);
});

test("the reason line comes from the strongest signal", () => {
  assert.equal(suggestionReason({ ...none, followsYou: true, mutuals: ["Sam"] }), "Follows you");
  assert.equal(suggestionReason({ ...none, followsYou: true, mutuals: ["A", "B", "C", "D", "E"] }), "Followed by A and 4 others");
  assert.equal(suggestionReason({ ...none, clubs: [club("Fantasy Book Club")] }), "In Fantasy Book Club with you");
  assert.equal(suggestionReason({ ...none, clubs: [club("Crime Club", 12), club("Fantasy Book Club", 4)] }), "In Fantasy Book Club and 1 more club with you");
  assert.equal(suggestionReason({ ...none, circles: [circle("Piranesi", false)] }), "Read Piranesi with you");
  assert.equal(suggestionReason({ ...none, circles: [circle("Piranesi", false), circle("Circe", true)] }), "Reading Circe with you");
  // Three mutuals (30) outweigh one circle (25).
  assert.equal(suggestionReason({ ...none, circles: [circle("Babel", true)], mutuals: ["A", "B", "C"] }), "Followed by A and 2 others");
  // Equal points: the earlier signal (club before mutuals) wins.
  assert.equal(suggestionReason({ ...none, clubs: [club("Club")], mutuals: ["A", "B", "C"] }), "In Club with you");
});

test("a big club or circle counts for less than a small one", () => {
  // Over SMALL_GROUP members, most are strangers to each other: as much as one mutual.
  assert.equal(suggestionScore({ ...none, clubs: [club("Big Night Owls", 37)] }), 10);
  assert.equal(suggestionScore({ ...none, circles: [circle("Babel", true, 40)] }), 10);
  // A small circle outranks a big club.
  const ranked = rankSuggestions([
    { name: "big", signals: { ...none, clubs: [club("Big Night Owls", 37)] } },
    { name: "small", signals: { ...none, circles: [circle("Fourth Wing", true, 3)] } },
  ]);
  assert.deepEqual(ranked.map((r) => r.name), ["small", "big"]);
});

test("followed-by wording matches reader search", () => {
  assert.equal(followedByText([]), null);
  assert.equal(followedByText(["Sam"]), "Followed by Sam");
  assert.equal(followedByText(["Sam", "Ali"]), "Followed by Sam and Ali");
  assert.equal(followedByText(["Sam", "Ali", "Jo"]), "Followed by Sam and 2 others");
});

test("ranking drops people with nothing to go on and keeps a stable order", () => {
  const ranked = rankSuggestions([
    { name: "zed", signals: { ...none, mutuals: ["Sam"] } },
    { name: "amy", signals: { ...none, mutuals: ["Sam"] } },
    { name: "top", signals: { ...none, followsYou: true } },
    { name: "nil", signals: none },
  ]);
  assert.deepEqual(ranked.map((r) => r.name), ["top", "amy", "zed"]);
  assert.equal(rankSuggestions(Array.from({ length: 30 }, (_, i) => ({ name: `r${i}`, signals: { ...none, followsYou: true } })), 6).length, 6);
});

test("the feed offers suggestions only while following fewer than five", () => {
  assert.equal(feedShowsSuggestions(0), true);
  assert.equal(feedShowsSuggestions(4), true);
  assert.equal(feedShowsSuggestions(5), false);
});

test("the opt-out reads as on until switched off, and saves the other way round", () => {
  const base = { plan: "FREE" as const };
  assert.equal(preferencesOf(base).suggestMe, true);
  assert.equal(preferencesOf({ ...base, hideFromSuggestions: true }).suggestMe, false);
  assert.deepEqual(storedSetting("suggestMe", false), { hideFromSuggestions: true });
  assert.deepEqual(storedSetting("showSpoilers", true), { showSpoilers: true });
});

// ---- Who may be suggested -------------------------------------------------------------------

const user = (id: string, extra: Partial<CandidateUser> = {}): CandidateUser => ({
  id, username: id, displayName: null, image: null, favColour: null, bio: `${id}'s bio`, createdAt: now, ...extra,
});

const input = (extra: Partial<SuggestionInput>): SuggestionInput => ({
  viewerId: "me", following: [], requested: [], blocked: [], dismissed: [], followers: [],
  clubMates: [], circleMates: [], via: [], viaUsers: [], recentlyActive: [], users: [], now, ...extra,
});

const names = (s: { username: string }[]) => s.map((p) => p.username);

test("never suggests private, suspended, opted-out, blocked, dismissed, followed, requested or self", () => {
  const ids = ["ok", "private", "suspended", "lifted", "optedOut", "blocked", "dismissed", "followed", "requested", "me"];
  const users = ids.map((id) => user(id, {
    ...(id === "private" ? { profileVisibility: "PRIVATE" } : {}),
    ...(id === "suspended" ? { suspendedAt: old } : {}),
    // A suspension that's run out no longer hides them.
    ...(id === "lifted" ? { suspendedAt: old, suspendedUntil: old } : {}),
    ...(id === "optedOut" ? { hideFromSuggestions: true } : {}),
  }));
  const out = assembleSuggestions(input({
    users, followers: ids, blocked: ["blocked"], dismissed: ["dismissed"], following: ["followed"], requested: ["requested"],
  }));
  assert.deepEqual(names(out).sort(), ["lifted", "ok"]);
});

test("only a real connection makes a suggestion: no club, circle, follow or mutual means nobody", () => {
  assert.deepEqual(assembleSuggestions(input({ users: [user("stranger")] })), []);
});

test("a followers-only reader is suggested without their bio, and asks to follow", () => {
  const fo = user("fo", { profileVisibility: "FOLLOWERS" });
  const [s] = assembleSuggestions(input({ users: [fo], clubMates: [{ userId: "fo", clubName: "Fantasy Book Club", clubSize: 6 }] }));
  assert.equal(s.reason, "In Fantasy Book Club with you");
  assert.equal(s.bio, null);
  assert.equal(s.needsApproval, true);
});

test("a public reader shows their bio and can be followed straight away", () => {
  const [s] = assembleSuggestions(input({ users: [user("pub")], circleMates: [{ userId: "pub", title: "Circe", active: true, size: 3 }] }));
  assert.equal(s.reason, "Reading Circe with you");
  assert.equal(s.bio, "pub's bio");
  assert.equal(s.needsApproval, false);
});

test("a mutual is only named when their follow list is visible, and never when suspended", () => {
  const via = ["open", "hidden", "susp", "notFollowed"].map((followerId) => ({ followerId, followingId: "cand" }));
  const viaUsers = [
    { id: "open", username: "open", displayName: "Open Reader" },
    { id: "hidden", username: "hidden", displayName: null, hideFollowCounts: true },
    { id: "susp", username: "susp", displayName: null, suspendedAt: old },
    // Someone the viewer doesn't follow (any more): not theirs to see through.
    { id: "notFollowed", username: "notFollowed", displayName: null },
  ];
  const [s] = assembleSuggestions(input({ users: [user("cand")], via, viaUsers, following: ["open", "hidden", "susp"] }));
  assert.equal(s.reason, "Followed by Open Reader");
  // Nobody visible: no suggestion from them at all.
  assert.deepEqual(assembleSuggestions(input({ users: [user("cand")], via: via.slice(1), viaUsers, following: ["hidden", "susp"] })), []);
});

test("quiet accounts sink below active ones", () => {
  const out = assembleSuggestions(input({
    users: [user("quiet", { createdAt: old }), user("busy", { createdAt: old })],
    followers: ["quiet", "busy"],
    recentlyActive: ["busy"],
  }));
  assert.deepEqual(names(out), ["busy", "quiet"]);
});
