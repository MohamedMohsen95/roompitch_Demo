// Light or dark. Light unless the designer switched to dark (the nav bar's theme button, ui/ThemeButton.tsx):
// the system's own dark mode doesn't change it. The choice is kept in this browser and shown by
// data-theme on <html>, which studio.css (and the 3D view's background, three/scene.js) follow.
const KEY = "rp_theme";
const subs = new Set();

function saved(){
  try { return localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

let theme = saved();
const show = () => { document.documentElement.dataset.theme = theme; };

export const getTheme = () => theme;

export function setTheme(t){
  theme = t === "dark" ? "dark" : "light";
  try { localStorage.setItem(KEY, theme); } catch { /* private window: this visit only */ }
  show();
  subs.forEach(fn => fn());
}

export function onTheme(fn){ subs.add(fn); return () => subs.delete(fn); }

// On the studio's first load, before anything is drawn.
export function applyTheme(){ show(); }
