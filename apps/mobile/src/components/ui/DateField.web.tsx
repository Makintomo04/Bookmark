import { useEffect, useState } from "react";
import { TextField } from "./TextField";

// The web build (development only) has no native date picker: the day is typed as YYYY-MM-DD.
const pad = (n: number) => String(n).padStart(2, "0");
export const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function DateField({ label, value, onChange, optional }: { label: string; value: string | null; onChange: (day: string | null) => void; optional?: boolean }) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(new Date(`${text}T00:00:00`).getTime());
  return (
    <TextField
      label={label}
      value={text}
      placeholder="2026-11-01"
      onChangeText={(t) => {
        setText(t);
        if (/^\d{4}-\d{2}-\d{2}$/.test(t)) onChange(t);
        else if (!t && optional) onChange(null);
      }}
      error={text && !valid ? "Use a date like 2026-11-01" : null}
    />
  );
}
