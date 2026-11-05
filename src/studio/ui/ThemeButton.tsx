// The nav bar's light/dark switch: shows the mode it switches to (a moon in light mode, a sun in dark).
import { useSyncExternalStore } from "react";
import { getTheme, setTheme, onTheme } from "../theme.js";
import { t } from "../i18n.js";
import { useLang } from "./hooks";
import { IconSun, IconMoon } from "./Icons";

export default function ThemeButton({className = "btn ghost icon"}: {className?: string}){
  useLang();
  const theme = useSyncExternalStore(onTheme, getTheme);
  const dark = theme === "dark";
  const label = t(dark ? "themeLight" : "themeDark");
  return (
    <button type="button" className={className + " themebtn"} title={label} aria-label={label}
      onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <IconSun/> : <IconMoon/>}
    </button>
  );
}
