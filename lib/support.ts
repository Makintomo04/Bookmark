// Where readers reach a person: the legal pages, the footer, and the report alerts staff receive.
// SUPPORT_EMAIL must be set before launch; until then pages show a visible placeholder and alerts are
// logged instead of sent (lib/reportAlerts.ts).
export const supportEmail: string | null = process.env.SUPPORT_EMAIL?.trim() || null

export const supportEmailLabel = supportEmail ?? "[SUPPORT_EMAIL not set]"
