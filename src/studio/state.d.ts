// Types for state.js (used by the TypeScript interface).
import type { Room, Item, RoomForm, Point, Opening } from "./types";

export const S: Room;
export function findItem(id: number | null | undefined): Item | undefined;
export function selectedItem(): Item | null | undefined;
export function isSelectedItem(id: number): boolean;
export function foot(it: Item): {w: number, d: number};
export function walls(): {i: number, a: Point, b: Point, len: number}[];
export function wallLen(i: number): number;
export function clampItem(it: Item): void;
export function nearestWall(x: number, y: number): number | null;
export function wallArea(i: number): number;
export function applyRoom(room: {form: RoomForm, poly: Point[], openings: Opening[], H: number}, opts?: {keepDesign?: boolean}): void;
