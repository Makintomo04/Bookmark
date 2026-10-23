import { Text } from "@/components/ui/Text";
import { Screen } from "@/components/ui/Screen";

// A tab's stand-in until its screens are ported from the web.
export function ComingNext({ title, description }: { title: string; description: string }) {
  return (
    <Screen>
      <Text variant="display">{title}</Text>
      <Text variant="muted">{description}</Text>
    </Screen>
  );
}
