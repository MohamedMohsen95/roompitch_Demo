import type { Point } from "../types";
export type Edit = {id: string, kind: "wall" | "erase", a: Point, b: Point};
export function applyEdits(read: any, edits: Edit[], k: number, scale?: number | null): any;
export function drawnGaps(read: any, k: number): {a: Point, b: Point}[];
