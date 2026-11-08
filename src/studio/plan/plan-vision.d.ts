export const TEXT_PROMPT: string;
export function parseTextReply(text: string | null | undefined): {rooms: {name: string, size: string | null, area: string | null}[]};
export function parsePointReply(json: any, size: {w: number, h: number}): [number, number][];
