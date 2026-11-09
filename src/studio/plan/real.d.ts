import type { Point } from "../types";
import type { Flat } from "./flat";

export type RealFlat = {spaces: {id: string, poly: Point[]}[], openings: {id: string, a: Point, b: Point}[], confirmed: string[]};
export function realOf(flat: Flat): RealFlat;
export function materialize(flat: Flat): Flat;
export function realSpace(flat: Flat, id: string): {id: string, poly: Point[]} | null;
