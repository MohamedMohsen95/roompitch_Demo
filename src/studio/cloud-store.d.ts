// Types for cloud-store.js (used by the TypeScript interface).
export function cloudReady(): Promise<any>;
export function pushRoom(data: object): void;
export function pullRoom(): Promise<any>;
export function pushFlat(flat: object): void;
export function listProjects(): Promise<{id: string, name: string, kind: "studio" | "flat", updatedAt: string, form: any, pieces: number, current: boolean}[] | null>;
export function openProject(id: string): Promise<{kind: "studio" | "flat", data: any} | null>;
export function planImageUrl(path: string): Promise<string | null>;
export function newProject(name: string, kind?: "studio" | "flat"): void;
export function renameProject(id: string, name: string): Promise<boolean>;
export function deleteProject(id: string): Promise<{ok: boolean, current?: boolean, kind?: "studio" | "flat"}>;
