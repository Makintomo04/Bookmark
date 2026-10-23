import { Tabs } from "expo-router";
import { BookOpen, Compass, Ellipsis, Newspaper, UsersRound } from "lucide-react-native";
import { useTheme } from "@/lib/theme";

// The signed-in app. Library is your own profile, as on the web; More holds stats, Wrapped, quests,
// achievements, favourites, Plus and settings.
export default function TabsLayout() {
  const { colors, fonts } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Library", tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} /> }} />
      <Tabs.Screen name="feed" options={{ title: "Feed", tabBarIcon: ({ color, size }) => <Newspaper color={color} size={size} /> }} />
      <Tabs.Screen name="circles" options={{ title: "Circles", tabBarIcon: ({ color, size }) => <UsersRound color={color} size={size} /> }} />
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} /> }} />
    </Tabs>
  );
}
