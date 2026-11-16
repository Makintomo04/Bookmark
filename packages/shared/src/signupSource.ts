// Counting sign-ups that start from something we put out in the world, such as a Wrap card's link.
// The page they land on carries a ?from= mark, the join prompts carry that page through sign-up as
// the callbackUrl, and sign-up stores the mark on the new account (User.signupSource), counted on
// /staff. All in the address: no cookie, so the privacy page's "a session cookie, that's it" holds.

export const SIGNUP_SOURCES = ["card"] as const
export type SignupSource = typeof SIGNUP_SOURCES[number]

export const parseSignupSource = (raw: unknown): SignupSource | null =>
  SIGNUP_SOURCES.includes(raw as SignupSource) ? (raw as SignupSource) : null

// The mark on a path on this site ("/u/bigshelf?from=card"), or null. Google and Apple sign-up wrap the
// page in another callback ("/?callbackUrl=%2Fu%2Fbigshelf%3Ffrom%3Dcard"), so it looks a few levels in.
export function signupSourceFrom(path: string | null | undefined, depth = 3): SignupSource | null {
  if (!path || depth === 0) return null
  try {
    const params = new URL(path, "https://bookmark.invalid").searchParams
    return parseSignupSource(params.get("from")) ?? signupSourceFrom(params.get("callbackUrl"), depth - 1)
  } catch {
    return null
  }
}
