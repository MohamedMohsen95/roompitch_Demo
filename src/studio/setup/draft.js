// The "New room" form as data (centimetres), and its conversion to a room (metres). No DOM.
import { shapePoly, wallsOf, validateOpenings, toM, toCm } from "../geometry.js";
import { openingsFromFractions } from "../vision.js";

let seq = 0;
const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const newDraft = (mode = "manual") => ({
  mode, shape:"rect", lengthCm:500, widthCm:400, cutLengthCm:200, cutWidthCm:150, corner:"ne", heightCm:280,
  openings:[],      // {id, type, wall, offsetCm, widthCm, heightCm, sillCm, fromAI}
  photos:[]         // {id, dataUrl, wall}
});

const formOf = (d) => ({shape:d.shape, lengthCm:+d.lengthCm, widthCm:+d.widthCm, cutLengthCm:+d.cutLengthCm, cutWidthCm:+d.cutWidthCm, corner:d.corner, heightCm:+d.heightCm});

// [{i, lenCm}] for the current shape, [] when the shape is invalid.
export function draftWalls(d){
  const s = shapePoly(formOf(d));
  return s.error ? [] : wallsOf(s.poly).map(w => ({i:w.i, lenCm:toCm(w.len)}));
}

// Door 90 × 210, window 120 × 120 with a 90 cm sill, centred on the wall.
export function newOpening(type, wall, d){
  const w = draftWalls(d)[wall], size = type === "door" ? {widthCm:90, heightCm:210, sillCm:0} : {widthCm:120, heightCm:120, sillCm:90};
  const offsetCm = w ? Math.max(0, Math.round((w.lenCm - size.widthCm) / 2)) : 0;
  return {id:uid("o"), type, wall, offsetCm, ...size, fromAI:false};
}

// -> {ok, room:{form, poly, openings, H} | null, shapeError, openingErrors}
export function draftToRoom(d){
  const form = formOf(d);
  if (!(form.heightCm >= 200)) return {ok:false, room:null, shapeError:"tooLow", openingErrors:{}};
  const s = shapePoly(form);
  if (s.error) return {ok:false, room:null, shapeError:s.error, openingErrors:{}};
  const H = toM(form.heightCm);
  const openings = d.openings.map(o => ({
    id:o.id, type:o.type, wall:+o.wall, offset:toM(o.offsetCm), width:toM(o.widthCm), height:toM(o.heightCm),
    sill:o.type === "door" ? 0 : toM(o.sillCm), ...(o.fromAI ? {fromAI:true} : {})
  }));
  const openingErrors = validateOpenings(s.poly, H, openings);
  return {ok:Object.keys(openingErrors).length === 0, room:{form, poly:s.poly, openings, H}, shapeError:null, openingErrors};
}

// A room already in the studio, back into the form (photos are added by the caller).
export function roomToDraft({form, openings, H}){
  return {
    ...newDraft("manual"), ...form, heightCm:toCm(H),
    openings:openings.map(o => ({id:o.id, type:o.type, wall:o.wall, offsetCm:toCm(o.offset), widthCm:toCm(o.width), heightCm:toCm(o.height), sillCm:toCm(o.sill), fromAI:Boolean(o.fromAI)}))
  };
}

export const MAX_PHOTOS = 8;

// Add photos up to the limit; new ones are not tagged with a wall yet.
export function addPhotos(d, list){
  const room = Math.max(0, MAX_PHOTOS - d.photos.length), take = list.slice(0, room);
  d.photos.push(...take.map(p => ({id:p.id, dataUrl:p.dataUrl, wall:null})));
  return {added:take.length, skipped:list.length - take.length};
}

// Openings the AI found on one wall (as fractions) replace earlier AI ones on that wall.
export function applyAnalysis(d, wall, fractions){
  const w = draftWalls(d)[wall]; if (!w) return 0;
  const found = openingsFromFractions(fractions, {wall, wallLen:w.lenCm / 100, H:d.heightCm / 100}).map(o => ({
    id:uid("a"), type:o.type, wall, offsetCm:toCm(o.offset), widthCm:toCm(o.width), heightCm:toCm(o.height), sillCm:toCm(o.sill), fromAI:true
  }));
  d.openings = [...d.openings.filter(o => !(o.wall === wall && o.fromAI)), ...found];
  return found.length;
}
