// "Buy this book" links on a book page. Plain links to a shop, with our affiliate tag when one is
// configured: no scripts, cookies or tracking on Bookmark, so the privacy promise ("no third-party
// advertising or tracking cookies") still holds. The shop sets its own cookie once a reader clicks
// through, which the privacy page says.
//
// Amazon gets the book's own page when we know an ISBN (pickBuyIsbn: the print edition most readers
// shelved); Amazon lists other countries' editions as imports, and credits a tagged search too.
// Bookshop.org always gets a title search, tagged with ?affiliate=<id> (checked 1 Nov 2026: their /a/
// links resolve to that parameter). Before launch, check each shop's link format against its affiliate
// dashboard; a wrong one only loses the commission, the link still works.

export type BuyStore = "bookshop" | "amazon";

export interface BuyLink {
  store: BuyStore;
  label: string;
  href: string;
  // Carries our affiliate tag, so the page says we may earn a commission.
  affiliate: boolean;
}

// The tags, from the environment. Each is optional: a shop without one still gets a plain link.
export interface AffiliateIds {
  bookshopUs?: string | null;
  bookshopUk?: string | null;
  amazonUs?: string | null;
  amazonUk?: string | null;
}

type Region = "uk" | "us";

// UK readers get the UK shops; everyone else the US ones, which ship worldwide.
export function buyRegionFor(country: string | null | undefined): Region {
  const code = (country ?? "").toUpperCase();
  return code === "GB" || code === "UK" || code === "IM" || code === "JE" || code === "GG" ? "uk" : "us";
}

const digitsOf = (isbn: string | null | undefined) => (isbn ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();

// A valid ISBN-13 from either form, or null. ISBN-10s become 978-prefixed ISBN-13s.
export function toIsbn13(isbn: string | null | undefined): string | null {
  const raw = digitsOf(isbn);
  if (/^97[89]\d{10}$/.test(raw)) {
    const sum = [...raw.slice(0, 12)].reduce((total, d, i) => total + Number(d) * (i % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(raw[12]) ? raw : null;
  }
  if (/^\d{9}[\dX]$/.test(raw)) {
    const sum = [...raw].reduce((total, d, i) => total + (d === "X" ? 10 : Number(d)) * (10 - i), 0);
    if (sum % 11 !== 0) return null;
    const body = `978${raw.slice(0, 9)}`;
    const check = (10 - ([...body].reduce((total, d, i) => total + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10;
    return `${body}${check}`;
  }
  return null;
}

// The ISBN-10 of a 978 ISBN-13, which is the book's Amazon product id (ASIN). 979s have none.
export function toIsbn10(isbn13: string): string | null {
  if (!/^978\d{10}$/.test(isbn13)) return null;
  const body = isbn13.slice(3, 12);
  const sum = [...body].reduce((total, d, i) => total + Number(d) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return `${body}${check === 10 ? "X" : check}`;
}

export interface BuyEdition {
  isbn13?: string | null;
  isbn10?: string | null;
  format?: string | null;
  // How many readers shelved this edition.
  shelvedBy: number;
}

// The edition to link to: print over ebook and audiobook (an ebook's Amazon id isn't its ISBN), then the one most
// readers shelved. Null when no edition has a valid ISBN.
export function pickBuyIsbn(editions: BuyEdition[]): string | null {
  const print = (format?: string | null) => format !== "EBOOK" && format !== "AUDIOBOOK";
  const ranked = editions
    .map((edition) => ({ edition, isbn: toIsbn13(edition.isbn13) ?? toIsbn13(edition.isbn10) }))
    .filter((candidate): candidate is { edition: BuyEdition; isbn: string } => !!candidate.isbn)
    .sort((a, b) => Number(print(b.edition.format)) - Number(print(a.edition.format)) || b.edition.shelvedBy - a.edition.shelvedBy);
  return ranked[0]?.isbn ?? null;
}

const query = (book: { title: string; author?: string | null }) => [book.title, book.author].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

export function buyLinks(book: { title: string; author?: string | null; isbn13?: string | null }, country: string | null | undefined, ids: AffiliateIds): BuyLink[] {
  const terms = query(book);
  if (!terms) return [];
  const region = buyRegionFor(country);
  const isbn = toIsbn13(book.isbn13);

  const bookshopId = (region === "uk" ? ids.bookshopUk : ids.bookshopUs) || null;
  const bookshopHost = region === "uk" ? "https://uk.bookshop.org" : "https://bookshop.org";
  // Always a title search: the US and UK shops each stock only their own country's editions, and we
  // don't know an edition's country, so an ISBN finds nothing (or 404s as an /a/ link) in the other shop.
  // Bookshop.org's own /a/<id>/<isbn> links redirect to the product page with ?affiliate=<id>, so the
  // same parameter on a search carries the tag.
  const bookshop = new URL(`${bookshopHost}/search`);
  bookshop.searchParams.set("keywords", terms);
  if (bookshopId) bookshop.searchParams.set("affiliate", bookshopId);

  const amazonTag = (region === "uk" ? ids.amazonUk : ids.amazonUs) || null;
  const amazonHost = region === "uk" ? "https://www.amazon.co.uk" : "https://www.amazon.com";
  const asin = isbn ? toIsbn10(isbn) : null;
  let amazon: URL;
  if (asin) {
    amazon = new URL(`${amazonHost}/dp/${asin}`);
  } else {
    amazon = new URL(`${amazonHost}/s`);
    amazon.searchParams.set("k", isbn ?? terms);
    amazon.searchParams.set("i", "stripbooks");
  }
  if (amazonTag) amazon.searchParams.set("tag", amazonTag);

  // Bookshop.org first: it pays independent bookshops, which suits readers who left Goodreads over Amazon.
  return [
    { store: "bookshop", label: "Bookshop.org", href: bookshop.toString(), affiliate: !!bookshopId },
    { store: "amazon", label: "Amazon", href: amazon.toString(), affiliate: !!amazonTag },
  ];
}
