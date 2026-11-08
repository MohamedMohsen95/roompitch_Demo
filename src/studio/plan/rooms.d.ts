import type { WallRead } from "./walls";
export type Candidate = {id: string, label: number, outline: [number, number][], areaPx: number, hullRatio: number, touchesOutside: boolean, bridgeIds: string[]};
export function roomCandidates(read: WallRead): Candidate[];
export function labelAt(read: WallRead, p: [number, number], maxDist: number): number;
export function candidateByLabel(read: WallRead, label: number): Candidate | null;
export function fillAt(read: WallRead, p: [number, number]): Candidate | null;
