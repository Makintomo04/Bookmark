import { Fragment } from "react";
import { router } from "expo-router";
import { authorNames, isLinkableAuthor } from "@bookmark/shared/authors";
import { Text } from "@/components/ui/Text";
import { authorPath } from "@/lib/authors";
import { useTheme } from "@/lib/theme";

// A credit with each person tappable through to their author page (the web's AuthorLink). Placeholders
// ("Unknown") stay plain text.
export function AuthorNames({ author, variant = "muted" }: { author: string | null | undefined; variant?: "muted" | "body" | "small" }) {
  const { colors } = useTheme();
  const names = authorNames(author);
  if (names.length === 0) return <Text variant={variant}>{author}</Text>;
  return (
    <Text variant={variant}>
      {names.map((name, i) => (
        <Fragment key={`${name}-${i}`}>
          {i > 0 && (i === names.length - 1 ? " & " : ", ")}
          {isLinkableAuthor(name) ? (
            <Text
              variant={variant}
              accessibilityRole="link"
              accessibilityHint="Opens the author's page"
              onPress={() => router.push(authorPath(name) as never)}
              style={{ color: colors.foreground, textDecorationLine: "underline" }}
            >
              {name}
            </Text>
          ) : name}
        </Fragment>
      ))}
    </Text>
  );
}
