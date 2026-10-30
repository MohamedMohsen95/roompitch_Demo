// Types for catalog.js (used by the TypeScript interface).
import type { CatalogEntry } from "./types";

export const WALL_MATS: CatalogEntry[];
export const FLOOR_MATS: CatalogEntry[];
export const FURN: CatalogEntry[];
export const OPENING_TEX: Record<string, {tex: string, tile: number, turn?: boolean}>;
export function texMaps(m: Partial<CatalogEntry> | null | undefined): {base: string, normal?: string, arm?: string} | null;
export function isRug(type: string): boolean;
export const FURN_CATS: string[];
export function furnCat(f: CatalogEntry): string;
export const WM: Record<string, CatalogEntry>;
export const FM: Record<string, CatalogEntry>;
export const FU: Record<string, CatalogEntry>;
export const EN: Record<string, string>;
export function addModels(models: any[]): number;
export function applyCatalog(rows: any[]): number;
