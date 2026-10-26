import type { Curator } from "./listRules"

// The counts book details shows and the rules behind them, with no database access, so tests and the
// client can import them. lib/readerCounts.ts queries and re-exports these.

export const FACES_SHOWN = 3

export interface ReaderGroup {
  count: number
  people: Curator[]
}

export interface ReaderCounts {
  reading: ReaderGroup
  wantToRead: ReaderGroup
}

type Shelving = { userId: string, status: string }

// One reader per shelf however many copies (editions) they own, newest shelving first.
export function tallyReaders(rows: Shelving[]) {
  const reading: string[] = []
  const wantToRead: string[] = []
  const seen = new Set<string>()
  for (const { userId, status } of rows) {
    const key = `${status}:${userId}`
    if (seen.has(key)) continue
    seen.add(key)
    if (status === "STARTED") reading.push(userId)
    else if (status === "NOT_STARTED") wantToRead.push(userId)
  }
  return { reading, wantToRead }
}

// People the viewer follows ahead of strangers, otherwise in the order given.
export function followedFirst(ids: string[], followed: Set<string>) {
  return [...ids.filter((id) => followed.has(id)), ...ids.filter((id) => !followed.has(id))]
}
