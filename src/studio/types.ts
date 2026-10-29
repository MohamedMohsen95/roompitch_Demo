// Shapes of the studio's data, for the TypeScript interface (ui/). Units are metres unless named Cm.

export type Point = [number, number];

export type Item = {id: number, type: string, x: number, y: number, rot: number, z?: number, zAuto?: boolean};

export type Opening = {id: string, type: "door" | "window" | string, wall: number, offset: number, width: number, height: number, sill: number, fromAI?: boolean};

export type Selection =
  | {kind: "item", id: number}
  | {kind: "opening", id: string}
  | {kind: "wall", id: number}
  | {kind: "floor", id?: undefined};

export type RoomForm = {shape: string, lengthCm: number, widthCm: number, cutLengthCm: number, cutWidthCm: number, corner: string, heightCm: number};

export type Sun = {time: number, facing: string, season: string};

export type Room = {
  L: number, W: number, H: number;
  poly: Point[];
  form: RoomForm;
  openings: Opening[];
  walls: string[];
  floor: string;
  items: Item[];
  sun: Sun;
  sel: Selection | null;
  tab: "furn" | "open" | "wall" | "floor";
  nextId: number;
  replacing: number | null;
};

// A finish (wall or floor) or a piece of furniture from the catalog.
export type CatalogEntry = {
  id: string, name: string, ar?: string, price: number, c: string;
  kind?: string, tile?: number, turn?: boolean, tex?: string, texUrls?: {base: string, normal?: string, arm?: string};
  w: number, d: number, h: number, surface?: boolean, rug?: boolean, model?: string;
};
