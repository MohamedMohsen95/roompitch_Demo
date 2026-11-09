// The real flat: the flat's geometry in metres (flat frame = image px × scale), which corrections change.
// The tracing (spaces[].outline, openings[].a/b in image px) stays on the plan image; until the real flat
// differs from it (flat.real === null) the real flat is the tracing × scale.
import { orientCW } from "./flat.js";

const r6 = (v) => Math.round(v * 1e6) / 1e6 + 0;
const mul = (p, k) => [r6(p[0] * k), r6(p[1] * k)];

function derived(flat){
  const k = flat.scale;
  if (!(k > 0)) return {spaces:[], openings:[], confirmed:[]};
  return {
    spaces:flat.spaces.filter(s => s.outline && s.outline.length >= 3).map(s => ({id:s.id, poly:orientCW(s.outline).map(p => mul(p, k))})),
    openings:flat.openings.map(o => ({id:o.id, a:mul(o.a, k), b:mul(o.b, k)})),
    confirmed:[]
  };
}

export const realOf = (flat) => flat.real || derived(flat);
export const materialize = (flat) => flat.real ? flat : {...flat, real:derived(flat)};
export const realSpace = (flat, id) => realOf(flat).spaces.find(s => s.id === id) || null;
