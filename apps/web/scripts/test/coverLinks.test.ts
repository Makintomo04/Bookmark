// Pasted cover links: which addresses our server may fetch. No network.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/coverLinks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadCover, isPublicAddress } from "@/lib/covers";

test("public addresses pass; loopback, private, link-local and reserved ones don't", () => {
  for (const ip of ["8.8.8.8", "151.101.1.69", "2606:4700::1111", "::ffff:8.8.8.8"]) assert.ok(isPublicAddress(ip), ip);
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.122", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "198.18.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "not-an-ip",
  ]) assert.ok(!isPublicAddress(ip), ip);
  assert.ok(isPublicAddress("172.32.0.1"));
});

test("a link that isn't https, or points at our own machine, is refused before anything is fetched", async () => {
  await assert.rejects(downloadCover("not a link"), /isn't a link/);
  await assert.rejects(downloadCover("http://example.com/cover.jpg"), /https/);
  await assert.rejects(downloadCover("https://127.0.0.1/cover.jpg"), /can't be used/);
  await assert.rejects(downloadCover("https://[::1]/cover.jpg"), /can't be used/);
  await assert.rejects(downloadCover("https://localhost/cover.jpg"), /can't be used/);
});
