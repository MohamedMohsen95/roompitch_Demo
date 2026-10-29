// Types for geometry.js (used by the TypeScript interface).
import type { Point, Opening, RoomForm } from "./types";

export type Wall = {i: number, a: Point, b: Point, len: number};

export function toM(cm: number | string): number;
export function toCm(m: number | string): number;
export function shapePoly(form: RoomForm): {poly?: Point[], error?: string};
export function wallsOf(poly: Point[]): Wall[];
export function wallFrame(w: {a: Point, b: Point, len: number}): {dir: Point, normal: Point};
export function alongWall(w: Wall, s: number): Point;
export function bbox(poly: Point[]): {L: number, W: number};
export function polyArea(poly: Point[]): number;
export function pointInPoly(x: number, y: number, poly: Point[]): boolean;
export function rectInside(rect: {x: number, y: number, w: number, d: number}, poly: Point[]): boolean;
export function fitInside(rect: {x: number, y: number, w: number, d: number}, poly: Point[]): {x: number, y: number};
export function nearestWall(x: number, y: number, poly: Point[], maxDist?: number): number | null;
export function wallArea(i: number, poly: Point[], H: number, openings?: Opening[]): number;
export function validateOpenings(poly: Point[], H: number, openings: Opening[]): Record<string, string>;
