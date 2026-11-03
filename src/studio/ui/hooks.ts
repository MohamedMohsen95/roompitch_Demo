// React's view of the studio: components re-render after notify() (store.js) or a language change.
import { useEffect, useSyncExternalStore } from "react";
import { subscribe, getVersion } from "../store.js";
import { getLang, onLangChange } from "../i18n.js";

// Re-render whenever the room or the studio's interface state changes.
export const useStudio = () => useSyncExternalStore(subscribe, getVersion);

// The interface language ("en" | "ar"); re-renders when it changes.
export const useLang = (): string => useSyncExternalStore(onLangChange, getLang);

// Whether the CSS media query `q` matches; re-renders when that changes.
const mediaSubs = new Map<string, (fn: () => void) => () => void>();
const mediaSub = (q: string) => {
  if (!mediaSubs.has(q)) mediaSubs.set(q, fn => { const m = matchMedia(q); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); });
  return mediaSubs.get(q)!;
};
export const useMedia = (q: string) => useSyncExternalStore(mediaSub(q), () => matchMedia(q).matches);

// Run `fn` for keydown events on the whole page while the component is shown.
export function useKeydown(fn: (e: KeyboardEvent) => void){
  useEffect(() => {
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [fn]);
}
