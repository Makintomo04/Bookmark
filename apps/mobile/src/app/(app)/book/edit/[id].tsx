import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { formatPayload, runningTimeOf, type FormatChoice } from "@bookmark/shared/bookFormat";
import { SWATCHES } from "@bookmark/shared/profile";
import { BookCover } from "@/components/books/BookCover";
import { SWATCH_NAMES } from "@/components/profile/ProfileFields";
import { FormatFields } from "@/components/books/FormatFields";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { copyCoverLater, refreshAfterBookChange, useBooks, type Book } from "@/lib/books";
import { goBack } from "@/lib/navigation";
import { pickAndUploadImage } from "@/lib/upload";
import { useTheme } from "@/lib/theme";

// Editing a book's details (the web's BookEditModal): title, author, format and length, cover, the
// card colour shown when there's no cover, and genre. Also where a book comes off the shelf.

export default function EditBook() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: books, isLoading } = useBooks();
  const { colors } = useTheme();
  const book = books?.find((b) => b.id === id);
  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (!book) return <Screen><Text variant="display">Book not found</Text></Screen>;
  return <EditForm book={book} />;
}

const digits = (t: string, max: number) => t.replace(/\D/g, "").slice(0, max);

function EditForm({ book }: { book: Book }) {
  const { colors } = useTheme();
  const audio = book.progressUnit === "MINUTES";
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [pages, setPages] = useState(book.pages > 0 ? String(book.pages) : "");
  const [format, setFormat] = useState<FormatChoice>(audio ? "AUDIOBOOK" : "PRINT");
  const [hours, setHours] = useState(audio ? String(Math.floor((book.audioMinutes ?? 0) / 60)) : "");
  const [minutes, setMinutes] = useState(audio ? String((book.audioMinutes ?? 0) % 60) : "");
  const [cover, setCover] = useState(book.coverImage);
  const [cardColour, setCardColour] = useState(book.cardColour || SWATCHES[0]);
  const [genre, setGenre] = useState(book.genre ?? "");
  const [busy, setBusy] = useState<"save" | "cover" | "remove" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAudio = format === "AUDIOBOOK";

  const chooseCover = async () => {
    setBusy("cover");
    setError(null);
    try {
      const url = await pickAndUploadImage([2, 3]);
      if (url) setCover(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't upload that cover. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const runningTime = runningTimeOf(hours, minutes);
    if (!title.trim() || !author.trim()) return setError("Add the title and author.");
    if (isAudio && runningTime <= 0) return setError("Enter the audiobook's running time.");
    if (!isAudio && !(parseInt(pages, 10) > 0)) return setError("Enter the number of pages.");
    setBusy("save");
    setError(null);
    try {
      await api.patch(`/api/books/${book.id}`, {
        title: title.trim(),
        author: author.trim(),
        pages: pages || "",
        coverImgSrc: cover,
        cardColour,
        genre: genre.trim(),
        ...formatPayload(format, runningTime),
      });
      await refreshAfterBookChange();
      copyCoverLater(book.id);
      goBack(`/book/${book.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the details. Try again.");
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      await api.delete(`/api/books/${book.id}`);
      await refreshAfterBookChange();
      router.dismissTo("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't remove the book. Try again.");
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={styles.coverRow}>
        <BookCover book={{ title, author, coverImage: cover, cardColour }} width={96} />
        <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
          <Button title={cover ? "Change cover" : "Add a cover"} variant="ghost" loading={busy === "cover"} disabled={!!busy} onPress={chooseCover} />
          {cover ? <Button title="Remove cover" variant="ghost" disabled={!!busy} onPress={() => setCover("")} /> : null}
        </View>
      </View>
      {error && <Notice tone="error" message={error} />}
      <TextField label="Title" value={title} onChangeText={setTitle} />
      <TextField label="Author" value={author} onChangeText={setAuthor} />
      <FormatFields
        format={format}
        onFormat={setFormat}
        hours={hours}
        minutes={minutes}
        onHours={setHours}
        onMinutes={setMinutes}
        note="Progress is logged in minutes listened. Your place is kept as a percent if you switch."
      />
      <TextField label={isAudio ? "Pages · optional" : "Pages"} value={pages} onChangeText={(t) => setPages(digits(t, 5))} keyboardType="number-pad" />
      <TextField label="Genre · optional" value={genre} onChangeText={setGenre} placeholder="e.g. Fantasy" />
      {!cover && (
        <View style={{ gap: 8 }}>
          <Text variant="label">Card colour</Text>
          <Text variant="small">Shown with the title when the book has no cover.</Text>
          <View style={styles.swatches}>
            {SWATCHES.map((swatch) => (
              <Pressable
                key={swatch}
                accessibilityRole="radio"
                accessibilityLabel={SWATCH_NAMES[swatch] ?? swatch}
                accessibilityState={{ checked: cardColour === swatch }}
                onPress={() => setCardColour(swatch)}
                style={[styles.swatch, { backgroundColor: swatch, borderColor: cardColour === swatch ? colors.foreground : "transparent" }]}
              >
                {cardColour === swatch && <Check size={14} color="#ffffff" />}
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Button title="Save details" loading={busy === "save"} disabled={!!busy} onPress={save} />
      {confirmRemove ? (
        <View style={{ gap: 8 }}>
          <Text>Remove {book.title} from your shelf? Its progress, rating and review go with it.</Text>
          <Button title="Remove from shelf" variant="outline" loading={busy === "remove"} disabled={!!busy} onPress={remove} />
          <Button title="Keep it" variant="ghost" disabled={!!busy} onPress={() => setConfirmRemove(false)} />
        </View>
      ) : (
        <Button title="Remove from shelf" variant="ghost" disabled={!!busy} onPress={() => setConfirmRemove(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  coverRow: { flexDirection: "row", gap: 16, alignItems: "center" },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: "center", justifyContent: "center" },
});
