// Types for flat.js (used by the TypeScript interface). Outlines and openings are in plan pixels.
import type { Point, Opening } from "../types";
import type { RealFlat } from "./real";
import type { Edit } from "./edits";

export type Space = {id: string, name: string, outline: Point[], sizeText: string | null, areaText?: string | null, status: "todo" | "doing" | "done", design: any | null, fromAI: boolean, unnamed?: boolean, suggested?: boolean};
export type PlanOpening = {id: string, type: "door" | "window" | "open", a: Point, b: Point, heightCm: number, sillCm: number, fromAI: boolean, fromEdit?: boolean};
export type Flat = {
  v: 1 | 2, image: {w: number, h: number, path?: string, dataUrl?: string},
  scale: number | null, scaleFrom: "sizes" | "wall" | "guess" | null, H: number,
  scaleAsked?: boolean,               // the "whole plan or only this?" question was answered
  real?: RealFlat | null,
  edits?: Edit[],                     // walls drawn and stretches erased on the plan (image px)             // the real flat in metres; null = the tracing × scale
  spaces: Space[], openings: PlanOpening[], unplaced?: {name: string, sizeText: string | null, areaText?: string | null}[]
};
export type PlanForm = {shape: "plan", lengthCm: number, widthCm: number, heightCm: number};
export type SpaceRoom = {form: PlanForm, poly: Point[], openings: Opening[], H: number, origin: Point};

export const DEFAULT_H: number;
export function newFlat(image: {w: number, h: number, dataUrl?: string, path?: string}): Flat;
export function orientCW(outline: Point[]): Point[];
export function outlineProblem(outline: Point[]): null | "tooFewCorners" | "crossing" | "sameCorner";
export function scaleFromSizes(flat: Flat): {scale: number | null, flagged: string[]};
export function scaleFromWall(lenPx: number, lenCm: number): number | null;
export function snapPoint(p: Point, prev: Point | null, others: Point[], tolPx: number): Point;
export function wallLengthsCm(outline: Point[], scale: number): number[];
export function setWallLengthCm(outline: Point[], i: number, cm: number, scale: number): Point[];
export function spaceRoom(flat: Flat, spaceId: string): SpaceRoom;
export function writeBackOpenings(flat: Flat, spaceId: string, openings: Opening[]): Flat;
export function neighbours(flat: Flat, spaceId: string, withinM?: number): Point[][];
export function withSizeScale(flat: Flat): Flat;
export function readyFlat(flat: Flat, nameFor: (i: number) => string): Flat;
export function newId(prefix: string): string;
export function nearestPlanWall(flat: Flat, p: Point, tolPx: number, onlySpaceId?: string | null): {spaceId: string, i: number, a: Point, b: Point, len: number, t: number, d: number} | null;
export const WALL_TOL_M: number;
export function cleanOutline(outline: Point[], tolPx: number): Point[];
export function stretchWall(flat: Flat, spaceId: string, i: number, cm: number): Flat;
export function strayOpenings(flat: Flat): string[];
