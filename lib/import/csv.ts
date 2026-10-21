// A small RFC 4180 CSV parser: quoted fields may hold commas, doubled quotes and line breaks
// (Goodreads and StoryGraph reviews are often several paragraphs). Accepts CRLF, LF or CR rows,
// strips a leading BOM, and skips blank lines.
//
// Kept free of "@/" imports so scripts/test-import.ts can load it with plain Node.

export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A blank line parses as one empty field; drop it.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      endField();
      i++;
    } else if (ch === "\r") {
      endRow();
      i += input[i + 1] === "\n" ? 2 : 1;
    } else if (ch === "\n") {
      endRow();
      i++;
    } else {
      // A stray quote mid-field (unquoted) is kept as text, as spreadsheets do.
      field += ch;
      i++;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

// Rows as objects keyed by header. Headers are trimmed; missing trailing cells read as "".
export function parseCsvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { headers: [], records: [] };
  const headers = head.map((h) => h.trim());
  const records = body.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = cells[idx] ?? "";
    });
    return record;
  });
  return { headers, records };
}
