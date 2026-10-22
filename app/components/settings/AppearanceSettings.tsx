"use client"
import { FC, useEffect, useState } from 'react'
import { useTheme } from "next-themes"
import { Option, Segmented } from './controls'

type Theme = "dark" | "light" | "system"

const THEME_OPTIONS: Option<Theme>[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Match device" },
]

// Stored in this browser, not on the account, so it is per device. Dark is the default for everyone.
const AppearanceSettings: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { theme, setTheme } = useTheme()
  // next-themes only knows the stored choice after mount; until then show the default so the markup matches the server's.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const value = (mounted && (theme as Theme)) || "dark"

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-5">
      <div>
        <p className="text-sm font-medium">Appearance</p>
        <p className="text-xs text-muted-foreground">Applies on this device straight away.</p>
      </div>
      <Segmented id="appearance-theme" label="Theme" options={THEME_OPTIONS} value={value} onChange={setTheme} disabled={disabled || !mounted} />
    </div>
  )
}

export default AppearanceSettings
