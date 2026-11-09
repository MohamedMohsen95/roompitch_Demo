import type { Point } from "../types";
import type { Flat } from "./flat";
export function deriveOpens(flat: Flat, gaps: {a: Point, b: Point}[], tolPx: number): Flat;
