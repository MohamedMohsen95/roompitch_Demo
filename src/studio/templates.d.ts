// Types for templates.js (used by the TypeScript interface).
export type TemplateCard = {id: string, name: string, nameAr: string | null, description: string | null, cover: string | null,
  published: boolean, pieces: number, L: number, W: number,
  plan: {poly: [number, number][], items: {type: string, x: number, y: number, rot: number}[], floor: string} | null};
export function listTemplates(): Promise<TemplateCard[] | null>;
export function getTemplate(id: string): Promise<any>;
export function privatePieces(room: {items: {type: string}[]}): any[];
export function saveTemplate(t: {id?: string | null, name: string, nameAr?: string, description?: string, room: object, cover?: string | null}): Promise<{id: string, coverOk: boolean} | null>;
export function setPublished(id: string, published: boolean): Promise<boolean>;
export function deleteTemplate(id: string): Promise<boolean>;
export function templateName(id: string | null): Promise<string | null>;
