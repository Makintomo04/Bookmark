import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import useSWR from "swr";
import { Check } from "lucide-react-native";
import { ROLE_WELCOME, roleToWelcome, type StaffRole } from "@bookmark/shared/roleWelcome";
import type { StaffBadgeKind } from "@bookmark/shared/staffBadge";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { openWebSignedIn } from "@/lib/webSignedIn";

// The web's RoleWelcome: the first time the app loads after an admin makes someone a librarian or admin,
// what the role is and what it lets them do. Once per role, recorded through the same route as the web
// (/api/user/role-welcome), so seeing it on either is enough. The staff console is on the web.

// The seal they'll now wear, and the checklist's colour (the web's EMBLEM).
const EMBLEM: Record<StaffRole, { seal: StaffBadgeKind; tick: string }> = {
  LIBRARIAN: { seal: "librarian", tick: "#B8860B" },
  ADMIN: { seal: "team", tick: "#F13C3C" },
};

type Me = { role?: string | null; isStaff?: boolean | null; roleWelcomedAs?: string | null };

export function RoleWelcome() {
  const { colors } = useTheme();
  const { data: me, mutate } = useSWR<Me>("/api/user");
  const role = roleToWelcome(me);
  if (!me || !role) return null;
  const welcome = ROLE_WELCOME[role];
  const emblem = EMBLEM[role];

  // Closed straight away; the server records the role it holds, so a failed save just shows it again next time.
  const close = () => {
    void mutate({ ...me, roleWelcomedAs: role }, { revalidate: false });
    api.post("/api/user/role-welcome").catch(() => {});
  };
  const openConsole = () => {
    close();
    void openWebSignedIn("/staff");
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <Text variant="small" style={{ letterSpacing: 1.5, fontWeight: "600" }}>{welcome.heading.toUpperCase()}</Text>
            <StaffSeal kind={emblem.seal} size={80} shine pressable={false} />
            <View style={{ gap: 4 }}>
              <Text variant="display" style={{ textAlign: "center" }} accessibilityRole="header">{welcome.title}</Text>
              <Text variant="muted" style={{ textAlign: "center" }}>{welcome.lede}</Text>
            </View>

            <View style={styles.duties}>
              <Text variant="small">What you can do now</Text>
              {welcome.duties.map((duty) => (
                <View key={duty} style={styles.duty}>
                  <Check size={16} color={emblem.tick} style={{ marginTop: 3 }} />
                  <Text style={{ flex: 1 }}>{duty}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.badge, { backgroundColor: colors.muted }]}>
              <Text variant="small" style={{ color: colors.foreground }}>{welcome.badge}</Text>
            </View>

            <View style={styles.actions}>
              <Button title="Open the staff console" onPress={openConsole} />
              <Button title="Got it" variant="outline" onPress={close} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, maxHeight: "90%", borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  content: { alignItems: "center", gap: 16, padding: 24 },
  duties: { alignSelf: "stretch", gap: 8 },
  duty: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  badge: { alignSelf: "stretch", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  actions: { alignSelf: "stretch", gap: 8 },
});
