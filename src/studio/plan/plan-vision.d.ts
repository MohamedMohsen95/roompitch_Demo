import type { Flat } from "./flat";
export type PlanReply = {spaces: {name: string, outline: [number, number][], size: string | null}[], openings: {type: "door" | "window", x1: number, y1: number, x2: number, y2: number}[]};
export const PLAN_PROMPT: string;
export function parsePlanReply(text: string | null | undefined): PlanReply;
export function flatFromReply(reply: PlanReply, image: {w: number, h: number}): Flat;
