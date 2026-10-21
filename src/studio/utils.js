// Small helpers shared by the studio modules.

export const $ = (s) => document.querySelector(s);
export const fmt = (n) => Math.round(n).toLocaleString("en-US");
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const snap = (v) => Math.round(v * 20) / 20;   // 5 cm grid
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Lighten (p > 0) or darken (p < 0) a #rrggbb colour.
export function shade(hex, p){
  const n = parseInt(hex.slice(1), 16); const ch = [n >> 16, (n >> 8) & 255, n & 255];
  const f = (v) => clamp(Math.round(p < 0 ? v * (1 + p) : v + (255 - v) * p), 0, 255);
  return `rgb(${ch.map(f).join(",")})`;
}

// Seeded random numbers, so generated textures look the same on every load.
export function rng(seed){ let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
