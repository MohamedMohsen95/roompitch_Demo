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
export function standsInside(x: number, y: number, poly: Point[], margin: number): boolean;
export function rectInside(rect: {x: number, y: number, w: number, d: number}, poly: Point[]): boolean;
export function fitInside(rect: {x: number, y: number, w: number, d: number}, poly: Point[]): {x: number, y: number};
export function nearestWall(x: number, y: number, poly: Point[], maxDist?: number): number | null;
export function wallArea(i: number, poly: Point[], H: number, openings?: Opening[]): number;
/** Distance from one side of a piece to the wall it faces; from/to are the dimension line's ends. */
export type Clearance = {side: "n" | "e" | "s" | "w", wall: number, dist: number, from: Point, to: Point};
export function clearances(rect: {x: number, y: number, w: number, d: number}, poly: Point[]): Clearance[];
/** `only`: a fixed reference (a window or door) that counts on that axis alone. */
type Rect = {x: number, y: number, w: number, d: number, only?: "x" | "y"};
/** An alignment guide: on axis "x" a vertical line at x = at from y = from to y = to (and the other way round for "y"). */
export type Guide = {axis: "x" | "y", at: number, from: number, to: number};
export function snapAlign(rect: Rect, others: Rect[], room: {L: number, W: number} | null, tol: number): {x: number, y: number};
export function alignGuides(rect: Rect, others: Rect[], room: {L: number, W: number} | null, eps?: number): Guide[];
/** Equal gaps either side of a piece: each gap runs along `along` from `from` to `to`, drawn at `at` across it. */
export type SpacingGuide = {along: "x" | "y", gaps: {from: number, to: number, at: number}[]};
export function spacingGuides(rect: Rect, others: Rect[], eps?: number): SpacingGuide[];
export function validateOpenings(poly: Point[], H: number, openings: Opening[]): Record<string, string>;
