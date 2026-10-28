// The feed page's two tabs, and the links to each. The bell's menu and the sign-in callback use these too,
// so the page's components stay out of the header's bundle.
export type FeedTab = "following" | "notifications"

export const feedTabHref = (tab: FeedTab) => (tab === "notifications" ? "/feed?tab=notifications" : "/feed")

export const parseFeedTab = (value: unknown): FeedTab => (value === "notifications" ? "notifications" : "following")
