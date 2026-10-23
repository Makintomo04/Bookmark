// The web build (for testing in a browser) has no App Store or Google Play, so there's nothing to buy.
// Same exports as purchases.ts.

export const purchasesAvailable = false;

export type PlanKind = "monthly" | "yearly" | "founding";
export interface StorePlan {
  kind: PlanKind;
  price: string;
  trial: string | null;
  pkg: unknown;
}

export async function startPurchases(_userId: string) {}
export async function endPurchases() {}
export async function loadPlans(): Promise<StorePlan[]> {
  return [];
}
export async function buy(_plan: StorePlan): Promise<boolean> {
  return false;
}
export async function restore() {}
export async function manageInStore() {}
