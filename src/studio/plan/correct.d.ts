import type { Flat } from "./flat";

export type Correction = {kind: "room", spaceId: string, axis: "width" | "length", cm: number} | {kind: "wall", spaceId: string, i: number, cm: number};
export type Affected = {id: string, name: string, before: [number, number], after: [number, number], confirmed: boolean};
export type CorrectionPlan =
  | {ok: true, side: number, otherSide: number | null, runsPast: boolean, outsideMoved: boolean, affected: Affected[]}
  | {ok: false, reason: "noScale" | "notRect" | "tooSmall" | "noChange"};
export function roomBox(flat: Flat, spaceId: string): {rect: boolean, width: number, length: number} | null;
export function planCorrection(flat: Flat, c: Correction, opts?: {side?: number, whole?: boolean}): CorrectionPlan;
export function applyCorrection(flat: Flat, c: Correction, opts: {side?: number, whole: boolean}): Flat;
