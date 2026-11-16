// Shop links and sponsored slots for free readers: the right shop per region, our tag only when one is
// configured, and Plus never sees a sponsored slot. No database.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/affiliate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buyLinks, buyRegionFor, pickBuyIsbn, toIsbn10, toIsbn13 } from "@bookmark/shared/affiliate";
import { activeSponsorship, seesSponsored, type Sponsorship } from "@bookmark/shared/sponsorships";

const book = { title: "Fourth Wing", author: "Rebecca Yarros" };

test("UK readers get the UK shops, everyone else the US ones", () => {
  assert.equal(buyRegionFor("GB"), "uk");
  assert.equal(buyRegionFor("us"), "us");
  assert.equal(buyRegionFor(null), "us");
  const uk = buyLinks(book, "GB", {});
  assert.match(uk[0].href, /^https:\/\/uk\.bookshop\.org\/search\?/);
  assert.match(uk[1].href, /^https:\/\/www\.amazon\.co\.uk\/s\?/);
  assert.match(buyLinks(book, "FR", {})[1].href, /^https:\/\/www\.amazon\.com\/s\?/);
});

test("links search for the title and author", () => {
  const [bookshop, amazon] = buyLinks(book, "US", {});
  assert.equal(new URL(bookshop.href).searchParams.get("keywords"), "Fourth Wing Rebecca Yarros");
  assert.equal(new URL(amazon.href).searchParams.get("k"), "Fourth Wing Rebecca Yarros");
});

test("the tag is added only when configured, and the link says so", () => {
  const plain = buyLinks(book, "US", {});
  assert.ok(plain.every((link) => !link.affiliate));
  assert.equal(new URL(plain[1].href).searchParams.get("tag"), null);

  const tagged = buyLinks(book, "GB", { amazonUk: "bookmark-21", amazonUs: "bookmark-20" });
  assert.equal(new URL(tagged[1].href).searchParams.get("tag"), "bookmark-21");
  assert.equal(tagged[1].affiliate, true);
  assert.equal(tagged[0].affiliate, false);
});

test("ISBNs are checked and converted", () => {
  assert.equal(toIsbn13("978-0-441-01359-3"), "9780441013593");
  assert.equal(toIsbn13("0441013597"), "9780441013593");
  assert.equal(toIsbn13("9780441013594"), null);
  assert.equal(toIsbn13("not an isbn"), null);
  assert.equal(toIsbn10("9780441013593"), "0441013597");
  assert.equal(toIsbn10("9791034730148"), null);
});

test("the print edition most readers shelved wins", () => {
  assert.equal(pickBuyIsbn([]), null);
  assert.equal(pickBuyIsbn([
    { isbn13: "9780747532699", format: "EBOOK", shelvedBy: 40 },
    { isbn13: "9780441013593", format: "PAPERBACK", shelvedBy: 2 },
    { isbn10: "0747532699", format: "HARDCOVER", shelvedBy: 5 },
    { isbn13: "bad", format: "PAPERBACK", shelvedBy: 99 },
  ]), "9780747532699");
});

test("with an ISBN, Amazon goes to the book's page and Bookshop.org still searches", () => {
  const ids = { bookshopUs: "1234", amazonUs: "bookmark-20" };
  const [bookshop, amazon] = buyLinks({ ...book, isbn13: "9780441013593" }, "US", ids);
  // Each Bookshop.org shop stocks only its own country's editions, so an ISBN can find nothing there.
  assert.equal(bookshop.href, "https://bookshop.org/search?keywords=Fourth+Wing+Rebecca+Yarros&affiliate=1234");
  assert.equal(amazon.href, "https://www.amazon.com/dp/0441013597?tag=bookmark-20");
  // A 979 has no Amazon product id: a tagged search for it.
  assert.equal(new URL(buyLinks({ ...book, isbn13: "9791034730148" }, "US", ids)[1].href).searchParams.get("k"), "9791034730148");
});

test("a book with no title gets no links", () => {
  assert.deepEqual(buyLinks({ title: "  " }, "US", {}), []);
});

test("free and signed-out readers see sponsored slots; Plus never does", () => {
  assert.equal(seesSponsored(null), true);
  assert.equal(seesSponsored({ plan: "FREE" }), true);
  assert.equal(seesSponsored({ plan: "PLUS" }), false);
  assert.equal(seesSponsored({ lifetime: true }), false);
  assert.equal(seesSponsored({ compPlusUntil: new Date(Date.now() + 86_400_000) }), false);
});

test("a sponsorship runs only in its placement and dates", () => {
  const booked: Sponsorship[] = [
    { id: "a", placement: "discover", sponsor: "A", title: "A", body: "", href: "https://example.com", startsOn: "2026-11-01", endsOn: "2026-11-07" },
    { id: "b", placement: "discover", sponsor: "B", title: "B", body: "", href: "https://example.com", startsOn: "2026-11-05", endsOn: "2026-11-30" },
  ];
  assert.equal(activeSponsorship("discover", "2026-10-31", booked), null);
  assert.equal(activeSponsorship("discover", "2026-11-07", booked)?.id, "a");
  assert.equal(activeSponsorship("discover", "2026-11-08", booked)?.id, "b");
  assert.equal(activeSponsorship("book-page", "2026-11-06", booked), null);
});
