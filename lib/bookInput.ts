// Field parsing shared by the add-book and edit-book routes.

// A running time as sent by the forms: minutes as a number or numeric string ("724"), or an object
// { hours, minutes }. Null when missing or not positive.
export function parseAudioMinutes(raw: unknown): number | null {
  if (raw && typeof raw === "object") {
    const o = raw as { hours?: unknown, minutes?: unknown }
    const total = (parseInt(String(o.hours ?? 0)) || 0) * 60 + (parseInt(String(o.minutes ?? 0)) || 0)
    return total > 0 ? Math.min(total, 100_000) : null
  }
  const n = parseInt(String(raw ?? ""))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : null
}
