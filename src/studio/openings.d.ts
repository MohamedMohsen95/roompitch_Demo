// Types for openings.js (used by the TypeScript interface).
import type { Opening } from "./types";

export type OpeningPreset = {id: string, name: string, ar?: string, type: string, width: number, height: number, sill: number};

export const OPENING_PRESETS: OpeningPreset[];
export const OP: Record<string, OpeningPreset>;
export function isGlassDoor(o: Opening): boolean;
export function openingKind(o: Opening): string;
export function openingDesc(o: Opening): string;
export function findOpening(id: string | null | undefined): Opening | undefined;
export function openingsOn(wall: number, exceptId?: string): Opening[];
export function nearestWallAny(x: number, y: number): {wall: number, along: number};
export function clampSize(o: Opening): void;
export function freeOffset(o: Opening, wanted: number): number | null;
export function addOpening(presetId: string, wall: number, along: number): Opening | null;
export function duplicateOpening(o: Opening): Opening | null;
export function centerOpening(o: Opening): boolean;
export function moveOpening(o: Opening, wall: number, wantedOffset: number): boolean;
export function refit(o: Opening): boolean;
