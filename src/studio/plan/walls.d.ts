import type { Img, Mask } from "./raster";
export type Bridge = {id: string, a: [number, number], b: [number, number], width: number, dir: "h" | "v", outside: boolean};
export type WallRead = {
  angle: number, size: {w: number, h: number}, src: {w: number, h: number}, thick: number,
  walls: Mask, closed: Mask, foot: Mask, bridges: Bridge[], hLines: Mask, vLines: Mask,
  quality: {ok: boolean, reason: null | "noPaper" | "noWalls" | "noThickness" | "noAngle" | "noEnclosure"}
};
export function readWalls(img: Img): WallRead;
export function toStraight(read: WallRead, p: [number, number]): [number, number];
export function toSource(read: WallRead, p: [number, number]): [number, number];
