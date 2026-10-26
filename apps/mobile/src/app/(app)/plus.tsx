import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from "react-native";
import useSWR from "swr";
import * as WebBrowser from "expo-web-browser";
import { Check, Sparkles } from "lucide-react-native";
import { FOUNDING, isIndefiniteComp } from "@bookmark/shared/entitlements";
import { FREE, FREE_SOON, PLUS, PLUS_SOON } from "@bookmark/shared/plusFeatures";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import { buy, loadPlans, manageInStore, purchasesAvailable, restore, type StorePlan } from "@/lib/purchases";
import { useTheme } from "@/lib/theme";

// Bookmark Plus (the web's /plus and the Plus part of settings): your plan, this month's AI allowances,
// the free and Plus columns, and the paywall. In the app Plus is bought through the App Store or Google
// Play (RevenueCat), at the store's prices, never by sending the reader to the website. A subscription
// someone already has from the website shows here too, and is managed there.

type Status = {
  plan: "FREE" | "PLUS";
  source: "subscription" | "store" | "lifetime" | "comp" | null;
  founding: boolean;
  patron: boolean;
  lifetime: boolean;
  compUntil: string | null;
  trialing: boolean;
  until: string | null;
  store: "APP_STORE" | "PLAY_STORE" | null;
  trialUsed: boolean;
};
type Allowance = { allowance: number | null; used: number; left: number | null; isPlus: boolean };
type PlusResponse = {
  status: Status | null;
  allowances: { askShelfSearches: Allowance; recaps: Allowance } | null;
  founding: { open: boolean; remaining: number; closesAt: string | null };
};

const day = (iso: string, year = true) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}) });
const storeName = (s: Status["store"]) => (s === "PLAY_STORE" ? "Google Play" : "the App Store");

export default function PlusScreen() {
  const { colors } = useTheme();
  const { data, error, isLoading, mutate } = useSWR<PlusResponse>("/api/plus/status");
  const refreshUser = useAuth((s) => s.refreshUser);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !data) return <Screen><Notice tone="error" message="We couldn't load Plus. Try again in a moment." /></Screen>;

  const status = data.status;
  const source = status?.source ?? null;
  const subscribed = source === "subscription" || source === "store" || source === "lifetime";
  const onChange = async () => {
    await mutate();
    void refreshUser();
  };

  return (
    <Screen edges={["left", "right"]}>
      <View style={{ alignItems: "center", gap: 12 }}>
        <View style={[styles.pill, { backgroundColor: colors.muted }]}>
          <Sparkles size={14} color={colors.brandText} />
          <Text variant="label" style={{ color: colors.brandText }}>Bookmark Plus</Text>
        </View>
        <Text variant="hero" style={{ textAlign: "center" }}>All your stats are free.</Text>
        <Text variant="muted" style={{ textAlign: "center", fontSize: 16, lineHeight: 23 }}>
          Plus lets you host more circles and set extra goals, with AI recaps on the way. It never gates your stats, your import, or the circles your friends invite you to.
        </Text>
      </View>

      {status && <PlanCard status={status} allowances={data.allowances} />}

      {!subscribed && <Paywall status={status} founding={data.founding} onChange={onChange} />}

      <Column title="Free" features={FREE} soon={FREE_SOON} />
      <Column title="Plus" features={PLUS} soon={PLUS_SOON} highlight />

    </Screen>
  );
}

// The reader's plan, where it comes from, and how to manage it.
function PlanCard({ status, allowances }: { status: Status; allowances: PlusResponse["allowances"] }) {
  const { colors } = useTheme();
  const summary = status.source === "lifetime" ? "Lifetime Plus. Thank you for backing Bookmark from the start."
    : status.source === "subscription"
      ? status.trialing && status.until
        ? `On your free trial until ${day(status.until, false)}. You started it on the web, where you can add a card to keep Plus.`
        : status.until ? `Renews or ends on ${day(status.until)}. You subscribed on the web, so it's managed there.` : "Thanks for supporting Bookmark."
      : status.source === "store"
        ? `Plus through ${storeName(status.store)}${status.until ? `, renewing or ending on ${day(status.until)}` : ""}.`
      : status.source === "comp" && status.compUntil
        ? isIndefiniteComp(status.compUntil) ? "Complimentary Plus from the Bookmark team, with no end date." : `Free Plus until ${day(status.compUntil)}.`
        : "You're on the free plan. Every stat, import and circle you join stays free.";
  const label = status.source === "lifetime" ? "Lifetime" : status.patron ? "Patron" : status.founding && status.source !== "comp" ? "Founding Reader" : status.trialing ? "Trial" : status.source === "comp" ? (isIndefiniteComp(status.compUntil) ? "Complimentary" : "Free months") : status.plan === "PLUS" ? "Active" : "Free";
  const allowanceLine = (name: string, a: Allowance) => (a.left === null ? null : `${name}: ${a.left} of ${a.allowance} left this month${a.isPlus ? " (fair use)" : ""}`);
  const lines = allowances ? [allowanceLine("Ask the shelf", allowances.askShelfSearches), allowanceLine("Catch me up", allowances.recaps)].filter(Boolean) : [];

  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <View style={styles.row}>
        <Text variant="title">Your plan</Text>
        <View style={[styles.badge, { backgroundColor: status.plan === "PLUS" ? colors.muted : colors.muted }]}>
          <Text variant="label" style={{ fontSize: 12, color: status.plan === "PLUS" ? colors.brandText : colors.mutedForeground }}>{label}</Text>
        </View>
      </View>
      <Text variant="muted">{summary}</Text>
      {lines.map((l) => <Text key={l as string} variant="small">{l}</Text>)}
      {status.source === "store" && (
        <Button title="Manage subscription" variant="outline" onPress={() => void manageInStore().catch(() => Linking.openURL(status.store === "PLAY_STORE" ? "https://play.google.com/store/account/subscriptions" : "https://apps.apple.com/account/subscriptions"))} />
      )}
      {status.source === "subscription" && (
        <Button title="Manage on the web" variant="outline" onPress={() => void WebBrowser.openBrowserAsync(webUrl("/settings#plus"))} />
      )}
    </View>
  );
}

// The store's plans and the buy button. Prices are the store's own, in the reader's currency.
function Paywall({ status, founding, onChange }: { status: Status | null; founding: PlusResponse["founding"]; onChange: () => Promise<void> }) {
  const { colors } = useTheme();
  const [plans, setPlans] = useState<StorePlan[] | null>(null);
  const [interval, setBillingInterval] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (!purchasesAvailable) return;
    loadPlans().then(setPlans, () => setPlans([]));
  }, []);

  // Asks the server to read the purchase from RevenueCat, then shows the new plan.
  const sync = async () => {
    try {
      await api.post("/api/plus/store-sync");
    } catch {
      // The webhook still lands; Plus can take a minute to show.
    }
    await onChange();
  };

  if (!purchasesAvailable) {
    return (
      <View style={[styles.card, { borderColor: colors.border }]}>
        <Text variant="title">Get Plus</Text>
        <Text variant="muted">Purchases aren't set up in this build of the app yet.</Text>
      </View>
    );
  }
  if (!plans) return <ActivityIndicator color={colors.mutedForeground} />;

  const monthly = plans.find((p) => p.kind === "monthly");
  // Yearly gets the Founding price while it's open, as on the web.
  const foundingPlan = founding.open ? plans.find((p) => p.kind === "founding") : undefined;
  const yearly = foundingPlan ?? plans.find((p) => p.kind === "yearly");
  const chosen = interval === "monthly" ? monthly : yearly;

  const purchase = async () => {
    if (!chosen) return;
    setBusy("buy");
    setMessage(null);
    try {
      const bought = await buy(chosen);
      if (bought) {
        await sync();
        setMessage({ tone: "info", text: "Welcome to Plus. Thanks for supporting Bookmark." });
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "The purchase didn't go through. You haven't been charged." });
    } finally {
      setBusy(null);
    }
  };

  const restorePurchases = async () => {
    setBusy("restore");
    setMessage(null);
    try {
      await restore();
      await sync();
      setMessage({ tone: "info", text: "Restored. If you had Plus in this store, it's back on this account." });
    } catch {
      setMessage({ tone: "error", text: "Couldn't restore purchases. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  };

  if (plans.length === 0 || !chosen) {
    return (
      <View style={[styles.card, { borderColor: colors.border }]}>
        <Text variant="title">Get Plus</Text>
        <Text variant="muted">Plus isn't available from {Platform.OS === "ios" ? "the App Store" : "Google Play"} right now. Try again later.</Text>
        <Button title="Restore purchases" variant="ghost" loading={busy === "restore"} onPress={() => void restorePurchases()} />
      </View>
    );
  }

  const per = interval === "yearly" ? "year" : "month";
  const trial = !status?.trialUsed && chosen.trial;

  return (
    <View style={[styles.card, { borderColor: colors.brandFill, borderWidth: 2 }]}>
      <Segmented
        label="Billing period"
        options={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]}
        value={interval}
        onChange={setBillingInterval}
      />
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ fontSize: 36, lineHeight: 42, fontWeight: "700" }}>{chosen.price}</Text>
        <Text variant="muted">a {per}</Text>
      </View>
      {interval === "yearly" && foundingPlan ? (
        <View style={[styles.founding, { backgroundColor: colors.muted }]}>
          <Text>
            <Text variant="label">Founding Reader price.</Text> Yours for as long as you stay subscribed. {founding.remaining.toLocaleString("en-GB")} of {FOUNDING.cap.toLocaleString("en-GB")} left{founding.closesAt ? `, until ${day(founding.closesAt, false)}` : ""}.
          </Text>
        </View>
      ) : (
        <Text variant="muted">{interval === "yearly" ? "Billed once a year." : "Billed monthly. Cancel any time."}</Text>
      )}
      {message && <Notice tone={message.tone} message={message.text} />}
      <Button
        title={trial ? `Start your free trial (${chosen.trial})` : `Get Plus for ${chosen.price} a ${per}`}
        loading={busy === "buy"}
        disabled={busy !== null}
        onPress={() => void purchase()}
      />
      {/* What the stores require next to a subscription: the terms of renewal, and the legal pages. */}
      <Text variant="small">
        {trial ? `After the free trial, ${chosen.price} a ${per}. ` : ""}
        Plus renews automatically until you cancel, at least a day before the period ends, in your {storeName(Platform.OS === "android" ? "PLAY_STORE" : "APP_STORE")} account settings. Payment is charged to your {Platform.OS === "android" ? "Google" : "Apple"} account.
      </Text>
      <View style={styles.links}>
        <Button title="Restore purchases" variant="ghost" loading={busy === "restore"} disabled={busy !== null} onPress={() => void restorePurchases()} />
        <Button title="Terms" variant="ghost" onPress={() => void WebBrowser.openBrowserAsync(webUrl("/terms"))} />
        <Button title="Privacy" variant="ghost" onPress={() => void WebBrowser.openBrowserAsync(webUrl("/privacy"))} />
      </View>
    </View>
  );
}

function Column({ title, features, soon, highlight }: { title: string; features: string[]; soon: string[]; highlight?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <View style={[styles.row, { justifyContent: "flex-start", gap: 8 }]}>
        {highlight && <Sparkles size={18} color={colors.brandText} />}
        <Text variant="title" accessibilityRole="header">{title}</Text>
      </View>
      {features.map((f, i) => (
        <View key={f} style={styles.feature}>
          <Check size={16} color={colors.brandText} style={{ marginTop: 2 }} />
          <Text style={[{ flex: 1 }, highlight && i === 0 && { fontWeight: "600" }]}>{f}</Text>
        </View>
      ))}
      {soon.map((f) => (
        <View key={f} style={styles.feature}>
          <Check size={16} color={colors.mutedForeground} style={{ marginTop: 2 }} />
          <Text variant="muted" style={{ flex: 1 }}>{f} <Text variant="small">· Coming soon</Text></Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  card: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  founding: { borderRadius: 10, padding: 10 },
  feature: { flexDirection: "row", gap: 10 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
