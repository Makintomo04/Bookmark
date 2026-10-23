import Purchases, { PACKAGE_TYPE, PURCHASES_ERROR_CODE, type PurchasesPackage } from "react-native-purchases";
import { REVENUECAT_KEY } from "./config";

// Plus through the App Store and Google Play, via RevenueCat. The app logs in to RevenueCat with the
// Bookmark user id, so the webhook (apps/web/app/api/billing/revenuecat) knows whose purchase it is.
// The server, not this file, decides who has Plus: after a purchase the app asks it to read RevenueCat.
// The web build has no store, so purchases.web.ts stands in there.

export const purchasesAvailable = !!REVENUECAT_KEY;

let configuredFor: string | null = null;

// Called once the reader is signed in. Switching accounts on one phone moves RevenueCat to the new id.
export async function startPurchases(userId: string) {
  if (!REVENUECAT_KEY || configuredFor === userId) return;
  if (configuredFor === null) Purchases.configure({ apiKey: REVENUECAT_KEY, appUserID: userId });
  else await Purchases.logIn(userId);
  configuredFor = userId;
}

export async function endPurchases() {
  if (!configuredFor) return;
  configuredFor = null;
  await Purchases.logOut().catch(() => undefined);
}

export type PlanKind = "monthly" | "yearly" | "founding";
export interface StorePlan {
  kind: PlanKind;
  // The store's own price, in the reader's currency.
  price: string;
  // "1 week free", when the store offers a free trial on it.
  trial: string | null;
  pkg: PurchasesPackage;
}

const unitName: Record<string, string> = { DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" };

// The current offering's packages: RevenueCat's monthly and annual, and a custom one whose identifier
// says "founding" for the Founding Reader price.
export async function loadPlans(): Promise<StorePlan[]> {
  if (!configuredFor) return [];
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return packages.flatMap((pkg): StorePlan[] => {
    const kind: PlanKind | null = /founding/i.test(pkg.identifier) ? "founding"
      : pkg.packageType === PACKAGE_TYPE.MONTHLY ? "monthly"
      : pkg.packageType === PACKAGE_TYPE.ANNUAL ? "yearly" : null;
    if (!kind) return [];
    const intro = pkg.product.introPrice;
    const trial = intro && intro.price === 0
      ? `${intro.periodNumberOfUnits} ${unitName[intro.periodUnit] ?? intro.periodUnit.toLowerCase()}${intro.periodNumberOfUnits === 1 ? "" : "s"} free`
      : null;
    return [{ kind, price: pkg.product.priceString, trial, pkg }];
  });
}

// True once bought; false when the reader backed out of the store's sheet.
export async function buy(plan: StorePlan): Promise<boolean> {
  try {
    await Purchases.purchasePackage(plan.pkg);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    throw err;
  }
}

export async function restore() {
  await Purchases.restorePurchases();
}

// The store's own subscription page (cancel, change plan, billing).
export async function manageInStore() {
  await Purchases.showManageSubscriptions();
}
