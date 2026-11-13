// Types for cloud-store.js (used by the TypeScript interface).
export function cloudReady(): Promise<any>;
export function pushRoom(data: object): void;
export function pullRoom(): Promise<any>;
export function forgetLocalRoom(): Promise<void>;
export function forgetOthersRoom(): Promise<boolean>;
export function pushFlat(flat: object): void;
// plan: the room's outline and pieces in metres (null for a room saved without a shape, and for a flat).
export type ProjectCard = {id: string, name: string, kind: "studio" | "flat", updatedAt: string, form: any, pieces: number, current: boolean, H: number,
  plan: {poly: [number, number][], items: {type: string, x: number, y: number, rot: number}[]} | null, windows: number, doors: number};
export function listProjects(): Promise<ProjectCard[] | null>;
export function openProject(id: string): Promise<{kind: "studio" | "flat", data: any} | null>;
export function planImageUrl(path: string): Promise<string | null>;
export function newProject(name: string, kind?: "studio" | "flat"): void;
export function renameProject(id: string, name: string): Promise<boolean>;
export function saveCopy(name: string, data: object): Promise<string | null>;
export function deleteProject(id: string): Promise<{ok: boolean, current?: boolean, kind?: "studio" | "flat"}>;
export function flatInCloud(): boolean;
export type SaveStatus = "saved" | "saving" | "local" | "failed";
export function saveStatus(): SaveStatus;
export function onSaveStatus(fn: () => void): () => void;
