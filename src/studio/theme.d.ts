export type Theme = "light" | "dark";
export function getTheme(): Theme;
export function setTheme(t: Theme): void;
export function onTheme(fn: () => void): () => void;
export function applyTheme(): void;
