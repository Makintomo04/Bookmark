"use client";

import {useTheme} from "next-themes";
import { useEffect, useState } from "react";
import { HiMiniSun,HiMoon  } from "react-icons/hi2";
import { IoMoonOutline } from "react-icons/io5";
import { IoSunnyOutline } from "react-icons/io5";
import { PiMoonLight } from "react-icons/pi";


export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if(!mounted) return null

  return (
    <div className="hover:bg-slate-100 bg-slate-200 dark:bg-slate-700/60 dark:hover:bg-slate-600/60 rounded-full h-10 w-10 transition flex items-center justify-center">
      {/* The current theme is: {theme} */}
      {theme === "dark" ? <IoSunnyOutline  className="cursor-pointer" onClick={() => setTheme('light')} size={28}/>:
      <PiMoonLight    className="cursor-pointer" onClick={() => setTheme('dark')} size={28}/>}
    </div>
  )
};