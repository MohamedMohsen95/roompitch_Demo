import type { WallRead } from "./walls";
import type { Candidate } from "./rooms";
import type { Flat } from "./flat";
import type { Img } from "./raster";
export const isPrivateName: (name: string) => boolean;
export function readScale(img: Img, max?: number): {img: Img, k: number};
export function assembleFlat(read: WallRead, cands: Candidate[], text: {rooms: {name: string, size?: string | null, area?: string | null}[]},
  points: Record<string, [number, number][]>, image: {w: number, h: number, dataUrl?: string, path?: string}): Flat;
