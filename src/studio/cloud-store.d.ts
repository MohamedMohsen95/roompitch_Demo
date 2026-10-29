// Types for cloud-store.js (used by the TypeScript interface).
export function cloudReady(): Promise<any>;
export function pushRoom(data: object): void;
export function pullRoom(): Promise<any>;
export function listProjects(): Promise<{id: string, name: string, updatedAt: string, form: any, pieces: number, current: boolean}[] | null>;
export function openProject(id: string): Promise<any>;
export function newProject(name: string): void;
export function renameProject(id: string, name: string): Promise<boolean>;
export function deleteProject(id: string): Promise<{ok: boolean, current?: boolean}>;
