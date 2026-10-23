import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { webUrl } from "@/lib/config";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";

// Onboarding (username, colour, genres, first book) lands here in the screen port, after the web's
// /new-user. Until then this holds the place so a new account isn't dropped into an empty app.
export default function Setup() {
  const { refreshUser, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <Text variant="display">Let{"’"}s set up your profile</Text>
      <Text variant="muted">Pick a username and a colour, and you{"’"}re in. This step is coming to the app next; for now it{"’"}s on the web, and you{"’"}ll come straight back here.</Text>
      <Button title="Set up on the web" onPress={() => WebBrowser.openBrowserAsync(webUrl("/new-user"))} />
      <Button
        variant="outline"
        title="I've finished, check again"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await refreshUser().catch(() => {});
          setBusy(false);
        }}
      />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
