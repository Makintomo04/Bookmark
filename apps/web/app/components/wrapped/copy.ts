import type { WrappedData } from "@/lib/stats"

// Every line of Wrapped copy is written here by hand and picked by the numbers. Nothing is
// generated: the same reading always gets the same words.

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const fmt = (n: number) => n.toLocaleString("en-GB")
export const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`

// "you" on your own Wrapped, the reader's name on someone else's.
export interface Voice {
  own: boolean
  name: string
}
const they = (v: Voice) => (v.own ? "you" : v.name)
const They = (v: Voice) => (v.own ? "You" : v.name)
const their = (v: Voice) => (v.own ? "your" : `${v.name}'s`)

export function introLine(w: WrappedData, v: Voice) {
  if (w.isCurrentYear) return v.own ? `${w.year} isn't over yet, but here's how it's gone so far.` : `${w.year} so far, page by page.`
  return v.own ? `Here's the year you had, page by page.` : `Here's the year ${v.name} had, page by page.`
}

export function booksLine(w: WrappedData, v: Voice) {
  const n = w.books
  if (n === 1) return "One book, start to finish. That counts."
  if (n < 5) return "A handful, each one chosen."
  if (n < 12) return "A good, steady stack."
  if (n < 26) return "More than one a month. Not bad at all."
  if (n < 52) return "That's a book every couple of weeks, all year."
  if (n < 104) return "More than one a week. Every week."
  return `${They(v)} read like it was ${their(v)} job.`
}

// Paper is about 0.1 mm a leaf, two pages to a leaf.
export function pagesLine(pages: number) {
  const cm = Math.round(pages * 0.005)
  if (cm < 2) return "Every one of them turned by hand."
  if (cm < 100) return `Stacked up, that's about ${cm} cm of paper.`
  return `Stacked up, that's about ${(cm / 100).toFixed(1)} metres of paper.`
}

export function busiestLine(w: WrappedData, v: Voice) {
  if (!w.busiestMonth) return ""
  const { books } = w.busiestMonth
  if (books === 1) return "Even one book makes a month worth remembering."
  if (books >= 6) return `${plural(books, "book")} in a single month. Where did ${they(v)} find the time?`
  return `${plural(books, "book")} in one month. ${v.own ? "You were" : `${v.name} was`} on a roll.`
}

export function genreLine(w: WrappedData, v: Voice) {
  if (!w.topGenre) return ""
  if (w.topGenre.count === 1) return `${They(v)} kept it varied this year.`
  return `${They(v)} kept coming back to it: ${plural(w.topGenre.count, "book")}.`
}

export function topRatedLine(w: WrappedData) {
  if (!w.topRated) return ""
  if (w.topRated.rating >= 5) return "Five stars. The one to press on a friend."
  if (w.topRated.rating >= 4) return "The highest rating of the year."
  return "A tough crowd, but this one came out on top."
}

export function longestLine(w: WrappedData, v: Voice) {
  if (!w.longestBook) return ""
  const p = w.longestBook.pages
  if (p >= 800) return `${fmt(p)} pages, and ${they(v)} saw every one of them through.`
  if (p >= 400) return `${fmt(p)} pages. A proper commitment.`
  return `${fmt(p)} pages, the longest of the lot.`
}

export function medalsLine(count: number, v: Voice) {
  if (count === 0) return ""
  if (count === 1) return "One new medal for the shelf."
  return `${plural(count, "new medal")} for the shelf.`
}

export function tierLine(w: WrappedData, v: Voice) {
  if (w.tier) return `${plural(w.tierBooks, "book")} read on Bookmark, and the frame to show for it.`
  const toGo = 10 - w.tierBooks
  return v.own ? `${plural(toGo, "more book")} until a Bronze frame.` : `${plural(toGo, "more book")} to a Bronze frame.`
}

export function goalHeadline(w: WrappedData) {
  if (!w.goal) return "No goal, just reading"
  return w.goal.met ? "Goal met" : `${fmt(w.goal.completed)} of ${fmt(w.goal.target)}`
}

export function goalLine(w: WrappedData, v: Voice) {
  if (!w.goal) return w.books ? "Sometimes that's the best way to do it." : ""
  const { target, completed, met } = w.goal
  if (met) {
    const spare = completed - target
    return spare > 0 ? `${They(v)} aimed for ${fmt(target)} and read ${fmt(completed)}, ${fmt(spare)} to spare.` : `${They(v)} aimed for ${fmt(target)} and hit it exactly.`
  }
  if (w.isCurrentYear) return `${plural(target - completed, "book")} to go, and there's still time.`
  return `A goal isn't a deadline. Those were still ${plural(completed, "good book")}.`
}

export function dnfLine(dnf: number, v: Voice) {
  if (dnf === 0) return ""
  return `And ${plural(dnf, "book")} ${they(v)} put down. Life's too short for the wrong book.`
}

export function outroLine(w: WrappedData, v: Voice) {
  if (w.isCurrentYear) return "Here's to the books still to come."
  return v.own ? `That was ${w.year}. On to the next chapter.` : `That was ${their(v)} ${w.year}.`
}
