// Types for draft.js (used by the TypeScript interface).
import type { Point, Opening, RoomForm } from "../types";

export type DraftOpening = {id: string, type: string, wall: number, offsetCm: number, widthCm: number, heightCm: number, sillCm: number, fromAI: boolean};
export type DraftPhoto = {id: string, dataUrl: string, wall: number | null};
export type Draft = RoomForm & {mode: string, openings: DraftOpening[], photos: DraftPhoto[]};
export type DraftRoom = {form: RoomForm, poly: Point[], openings: Opening[], H: number};

export function newDraft(mode?: string): Draft;
export function draftWalls(d: Draft): {i: number, lenCm: number}[];
export function newOpening(type: string, wall: number, d: Draft): DraftOpening;
export function draftToRoom(d: Draft): {ok: boolean, room: DraftRoom | null, shapeError: string | null, openingErrors: Record<string, string>};
export function roomToDraft(room: {form: RoomForm, openings: Opening[], H: number}): Draft;
export function fitDraftToWalls(d: Draft): void;
export const MAX_PHOTOS: number;
export function addPhotos(d: Draft, list: {id: string, dataUrl: string}[]): {added: number, skipped: number};
export function applyAnalysis(d: Draft, wall: number, fractions: any[]): number;
