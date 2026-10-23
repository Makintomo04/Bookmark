// The add and edit forms only need to know one thing: is this an audiobook? Print and ebook both run
// on pages; an audiobook runs on minutes listened and needs a running time. Shared by the web's
// FormatPicker and the mobile app's book forms.
export type FormatChoice = "PRINT" | "EBOOK" | "AUDIOBOOK";

export const FORMAT_OPTIONS: { value: FormatChoice; label: string }[] = [
  { value: "PRINT", label: "Print" },
  { value: "EBOOK", label: "Ebook" },
  { value: "AUDIOBOOK", label: "Audiobook" },
];

// What /api/books (POST and PATCH) takes: the catalog's EditionFormat, and the running time for an audiobook.
export function formatPayload(format: FormatChoice, runningTime: number) {
  return {
    format: format === "PRINT" ? "PAPERBACK" : format,
    audioMinutes: format === "AUDIOBOOK" && runningTime > 0 ? runningTime : undefined,
  };
}

// Hours and minutes typed into the running-time fields, as minutes.
export const runningTimeOf = (hours: string, minutes: string) => (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0);
