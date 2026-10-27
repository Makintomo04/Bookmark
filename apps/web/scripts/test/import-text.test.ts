// A pasted list (lib/import/text.ts): the rules on their own, the model's answers checked against the
// lines they came from, headings carrying a shelf across batches, and a failed batch falling back to
// the rules. With a fake model; no database, no network.
//
//   npm run test:import:text
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  type LineReading, LINES_PER_CALL, ListInputError, MAX_LIST_LINES, grounded, listLines, readLineByRules, readLines, readList, splitTitleAuthor,
} from "../../lib/import/text.ts";

const fixture = readFileSync(new URL("./fixtures/notes-list.txt", import.meta.url), "utf8");
const book = (text: string) => readLineByRules({ n: 1, text });

test("rules: bullets, numbering, ticks, ratings and emoji come off; the title and author stay", () => {
  assert.deepEqual(book("- Fourth Wing by Rebecca Yarros"), { n: 1, kind: "book", title: "Fourth Wing", author: "Rebecca Yarros", shelf: null });
  assert.deepEqual(book("12. Babel - R. F. Kuang ⭐⭐⭐⭐"), { n: 1, kind: "book", title: "Babel", author: "R. F. Kuang", shelf: null });
  assert.deepEqual(book("✅ Iron Flame (Rebecca Yarros) 4.5/5"), { n: 1, kind: "book", title: "Iron Flame", author: "Rebecca Yarros", shelf: "read" });
  assert.deepEqual(book("- [x] The Hobbit"), { n: 1, kind: "book", title: "The Hobbit", author: null, shelf: "read" });
  assert.deepEqual(book("- [ ] Piranesi 📚"), { n: 1, kind: "book", title: "Piranesi", author: null, shelf: null });
  assert.deepEqual(book("~~Circe by Madeline Miller~~"), { n: 1, kind: "book", title: "Circe", author: "Madeline Miller", shelf: "read" });
  assert.deepEqual(book("A Court of Mist and Fury (DNF)"), { n: 1, kind: "book", title: "A Court of Mist and Fury", author: null, shelf: "dnf" });
});

test("rules: titles that look like numbering or ratings are left alone", () => {
  assert.equal((book("1984 by George Orwell") as { title: string }).title, "1984");
  assert.equal((book("11/22/63") as { title: string }).title, "11/22/63");
  assert.equal((book("2. 1984") as { title: string }).title, "1984");
  // A bracketed series is part of the title, not an author.
  assert.deepEqual(splitTitleAuthor("Dune (Dune, #1)"), { title: "Dune (Dune, #1)", author: null });
});

test("rules: headings, and the notes that aren't books", () => {
  assert.deepEqual(book("Read 2024:"), { n: 1, kind: "heading", shelf: "read" });
  assert.deepEqual(book("## TBR"), { n: 1, kind: "heading", shelf: "want" });
  assert.deepEqual(book("Currently reading"), { n: 1, kind: "heading", shelf: "reading" });
  assert.deepEqual(book("DNF"), { n: 1, kind: "heading", shelf: "dnf" });
  assert.deepEqual(book("Fantasy:"), { n: 1, kind: "heading", shelf: null });
  assert.equal(book("did Sam ever give back my copy?"), null);
  assert.equal(book("https://example.com/books"), null);
  assert.equal(book("I need to remember to pick up the next one in the series from the library on Saturday after work"), null);
});

test("lines: blank and symbol-only lines go, numbering is by the pasted text", () => {
  const lines = listLines("﻿Read\r\n\r\n- Dune\n---\n⭐⭐\nBabel");
  assert.deepEqual(lines.map((l) => [l.n, l.text]), [[1, "Read"], [3, "- Dune"], [6, "Babel"]]);
});

test("grounding: a title or author is kept only when it's in the line", () => {
  assert.equal(grounded("Fourth Wing", "- fourth wing!! by rebecca yarros"), true);
  assert.equal(grounded("Les Misérables", "les miserables"), true);
  assert.equal(grounded("Iron Flame", "Fourth Wing"), false);
  // Whole words only: "Dune" isn't in "Dunes of the North".
  assert.equal(grounded("Dune", "Dunes of the North"), false);
});

test("model answers: invented titles and authors are dropped, the rest kept", () => {
  const lines = [
    { n: 4, text: "acotar 🖤 sarah j maas" },
    { n: 5, text: "the one Jess lent me about the circus" },
    { n: 6, text: "Book Lovers" },
  ];
  const read = readLines(
    {
      lines: [
        { n: 4, kind: "book", title: "acotar", author: "sarah j maas", shelf: null },
        // Not in the line: the model named a book of its own.
        { n: 5, kind: "book", title: "The Night Circus", author: "Erin Morgenstern", shelf: null },
        // The title is there; the author isn't, so it goes.
        { n: 6, kind: "book", title: "Book Lovers", author: "Emily Henry", shelf: "read" },
        // A line that wasn't asked about.
        { n: 99, kind: "book", title: "Dune", author: null, shelf: null },
      ],
    },
    lines,
  );
  assert.deepEqual(read, [
    { n: 4, kind: "book", title: "acotar", author: "sarah j maas", shelf: null },
    { n: 6, kind: "book", title: "Book Lovers", author: null, shelf: "read" },
  ]);
  assert.deepEqual(readLines({ nonsense: true }, lines), []);
  // DNF needs the word in the line; a struck-through title is ticked off, not abandoned.
  const marked = [{ n: 1, text: "~~The Midnight Library~~" }, { n: 2, text: "Babel" }, { n: 3, text: "Circe (dnf)" }];
  const shelves = readLines(
    { lines: marked.map((l) => ({ n: l.n, kind: "book", title: l.text.replace(/~~| \(dnf\)/g, ""), author: null, shelf: "dnf" })) },
    marked,
  ).map((r) => (r.kind === "book" ? r.shelf : null));
  assert.deepEqual(shelves, ["read", null, "dnf"]);
});

test("readList: the fixture by the rules alone", async () => {
  const parsed = await readList(fixture, { ask: null });
  assert.equal(parsed.source, "list");
  assert.equal(parsed.readBy, "rules");
  const shelf = Object.fromEntries(parsed.rows.map((r) => [r.title, [r.author, r.status]]));
  assert.deepEqual(shelf["Fourth Wing"], ["Rebecca Yarros", "COMPLETED"]);
  assert.deepEqual(shelf["The Seven Husbands of Evelyn Hugo"], ["Taylor Jenkins Reid", "COMPLETED"]);
  assert.deepEqual(shelf["Babel"], ["R. F. Kuang", "STARTED"]);
  assert.deepEqual(shelf["Iron Flame"], ["Rebecca Yarros", "NOT_STARTED"]);
  assert.deepEqual(shelf["Piranesi"], ["Unknown", "NOT_STARTED"]);
  assert.deepEqual(shelf["A Court of Mist and Fury"], ["Unknown", "DNF"]);
  // Under "Fantasy:" (no shelf of its own) inside the TBR section.
  assert.deepEqual(shelf["The Name of the Wind"], ["Patrick Rothfuss", "NOT_STARTED"]);
  // Listed twice, kept once.
  assert.equal(parsed.rows.filter((r) => r.title === "Fourth Wing").length, 1);
  assert.ok(!parsed.rows.some((r) => /Sam|library/.test(r.title)), "notes to self aren't books");
  // A book marked read has one undated read.
  const read = parsed.rows.find((r) => r.title === "Fourth Wing")!;
  assert.deepEqual(read.completedReads, [{ startedAt: null, finishedAt: null }]);
  assert.equal(parsed.rows.find((r) => r.title === "Piranesi")!.completedReads.length, 0);
});

test("readList: the reader's default shelf for books the list doesn't place", async () => {
  const parsed = await readList("Dune\nBabel", { ask: null, defaultStatus: "COMPLETED" });
  assert.deepEqual(parsed.rows.map((r) => r.status), ["COMPLETED", "COMPLETED"]);
});

test("readList: a heading in one batch sets the shelf for lines in the next", async () => {
  const text = ["Read", ...Array.from({ length: LINES_PER_CALL + 5 }, (_, i) => `Book number ${String.fromCharCode(65 + (i % 26))}${i}`)].join("\n");
  const asked: number[] = [];
  const ask = async (lines: { n: number; text: string }[]): Promise<LineReading[]> => {
    asked.push(lines.length);
    return lines.map((l) => (l.text === "Read" ? { n: l.n, kind: "heading", shelf: "read" } : { n: l.n, kind: "book", title: l.text, author: null, shelf: null }));
  };
  const parsed = await readList(text, { ask });
  assert.deepEqual(asked, [LINES_PER_CALL, 6]);
  assert.equal(parsed.readBy, "model");
  assert.equal(parsed.rows.length, LINES_PER_CALL + 5);
  assert.ok(parsed.rows.every((r) => r.status === "COMPLETED"));
  // In line order, whichever batch came back first.
  assert.deepEqual(parsed.rows.map((r) => r.line), [...parsed.rows.map((r) => r.line)].sort((a, b) => a - b));
});

test("readList: a batch the model fails on is read by the rules instead", async () => {
  const text = Array.from({ length: LINES_PER_CALL * 2 }, (_, i) => `- Title ${i} by Author ${i}`).join("\n");
  let calls = 0;
  const ask = async (lines: { n: number; text: string }[]): Promise<LineReading[]> => {
    if (calls++ === 0) throw new Error("overloaded");
    return lines.map((l) => ({ n: l.n, kind: "book", title: l.text.replace(/^- /, "").split(" by ")[0], author: null, shelf: null }));
  };
  const parsed = await readList(text, { ask });
  assert.equal(parsed.readBy, "mixed");
  assert.equal(parsed.rows.length, LINES_PER_CALL * 2, "no line is lost");
  // The rules batch kept its authors; the model batch had none.
  assert.equal(parsed.rows.filter((r) => r.author !== "Unknown").length, LINES_PER_CALL);
});

test("readList: empty and oversized lists are refused", async () => {
  await assert.rejects(readList("  \n\n---\n", { ask: null }), ListInputError);
  await assert.rejects(readList(Array.from({ length: MAX_LIST_LINES + 1 }, (_, i) => `Book ${i}`).join("\n"), { ask: null }), /limit is 2,000/);
});
