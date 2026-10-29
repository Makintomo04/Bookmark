import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import type { ReportCounts } from "@/lib/staffOverview"

// The report counts behind the badges on the Staff link and the Reports tab, and the queue's tab counts.
// One key, so acting on a report can refresh them all. `waiting` is what's waiting on this person.
export const STAFF_COUNTS_URL = "/api/staff/overview?part=counts"
export type StaffCounts = ReportCounts & { waiting: number }

// Checked again every minute while the tab is in view (SWR skips hidden tabs), so the dot on the avatar
// turns up without a reload. Quiet if it fails: everything that shows a count works without one.
const REFRESH_MS = 60_000

export const useStaffCounts = (enabled = true) =>
  useSWR<StaffCounts>(enabled ? STAFF_COUNTS_URL : null, fetcher, { shouldRetryOnError: false, refreshInterval: REFRESH_MS, refreshWhenHidden: false })
