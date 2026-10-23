import { useColorScheme } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { brand, dark, hex, light, radius, type ThemeTokens } from "@bookmark/shared/tokens";

// The app's colours and type, from the same tokens as the web (packages/shared/src/tokens.ts), so the two
// can't drift. Dark-first: dark until the reader picks Light or Match device in More → Appearance, the
// same three choices as the web's appearance settings. The choice is kept per device, as on the web.

export type ThemePreference = "dark" | "light" | "system";

export const useThemePreference = create<{ preference: ThemePreference; setPreference: (p: ThemePreference) => void }>()(
  persist((set) => ({ preference: "dark", setPreference: (preference) => set({ preference }) }), {
    name: "bookmark.theme",
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

function paletteOf(tokens: ThemeTokens) {
  return {
    background: hex(tokens.background),
    foreground: hex(tokens.foreground),
    card: hex(tokens.card),
    popover: hex(tokens.popover),
    muted: hex(tokens.muted),
    mutedForeground: hex(tokens["muted-foreground"]),
    border: hex(tokens.border),
    input: hex(tokens.input),
    ring: hex(tokens.ring),
    danger: hex(tokens.danger),
    // One red per role: `brand` is the mark (logo, your progress, stars), `brandFill` is buttons with
    // white text, `brandText` is red words and links.
    brand: brand.DEFAULT,
    brandFill: brand.fill,
    brandFillPressed: brand["fill-hover"],
    brandText: hex(tokens["brand-text"]),
    onBrand: "#ffffff",
  };
}

export const palettes = { dark: paletteOf(dark), light: paletteOf(light) } as const;
export type Palette = (typeof palettes)["dark"];

// Literata for display (titles, heroes, big numbers), Inter for everything else. Loaded in app/_layout.
export const fonts = {
  display: "Literata_600SemiBold",
  displayItalic: "Literata_400Regular_Italic",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemibold: "Inter_600SemiBold",
} as const;

export const radii = { sm: radius - 4, md: radius - 2, lg: radius, pill: 999 } as const;

export function useTheme() {
  const preference = useThemePreference((s) => s.preference);
  const system = useColorScheme();
  const scheme: "dark" | "light" = preference === "system" ? (system === "light" ? "light" : "dark") : preference;
  return { scheme, colors: palettes[scheme], fonts, radii };
}
