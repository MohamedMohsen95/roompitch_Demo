import type { Point } from "../types";
import type { Flat } from "./flat";
export const openTol: (thick: number) => number;
export function deriveOpens(flat: Flat, gaps: {a: Point, b: Point}[], tolPx: number): Flat;
export function removeOpen(flat: Flat, id: string): Flat;
