// A reader asking for a hand-typed book (one neither Open Library nor Hardcover has) to be checked by a
// librarian and given a book page. It goes in the staff reports queue (lib/staffReports.ts reportBook).
export async function askToCatalogue(workId: string) {
  const res = await fetch('/api/books/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workId, reason: 'catalogue' }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't send that. Try again.")
}
