// What the designer can place: wall and floor finishes, furniture, and how the AI prompt names them.
// Example prices in EGP.

export const WALL_MATS = [
  {id:"bare-wall",   name:"Bare plaster (unfinished)", price:0, kind:"concrete", c:"#b9b4aa", tile:2},
  {id:"paint-white", name:"Matte white paint", price:180, kind:"paint", c:"#ecebe6", tile:1},
  {id:"paint-sage",  name:"Sage green paint", price:200, kind:"paint", c:"#a7b59d", tile:1},
  {id:"paint-clay",  name:"Terracotta paint", price:200, kind:"paint", c:"#c9917a", tile:1},
  {id:"wood-panel",  name:"Wood panelling",     price:1400, kind:"panel", c:"#9a6b43", tile:1.2},
  {id:"marble-wall", name:"Carrara marble",     price:2200, kind:"marble", c:"#e7e6e2", tile:1.4},
  {id:"wallpaper",   name:"Wallpaper",       price:450, kind:"wallpaper", c:"#d6cbb5", tile:.7}
];
export const FLOOR_MATS = [
  {id:"bare-floor",   name:"Bare screed (unfinished)", price:0, kind:"concrete", c:"#a9a49b", tile:2},
  {id:"oak",          name:"Oak parquet",     price:900,  kind:"parquet", c:"#b98b5b", tile:1.4},
  {id:"porcelain",    name:"Porcelain 60×120",  price:650,  kind:"tiles",   c:"#d8d5cf", tile:1.2},
  {id:"marble-floor", name:"Marble",            price:2400, kind:"marble",  c:"#efeeea", tile:1.6},
  {id:"concrete",     name:"Polished concrete",   price:550,  kind:"concrete",c:"#9d9f9d", tile:2}
];
// Built-in pieces are drawn from boxes; real 3D models from public/models are added by addModels().
// surface: other pieces can be placed on top of it (see stacking.js).
export const FURN = [
  {id:"sofa",     name:"3-seat sofa",  w:2.2, d:.9,  h:.85, price:18000, c:"#7b898d"},
  {id:"armchair", name:"Armchair",          w:.85, d:.85, h:.85, price:6500,  c:"#c2a078"},
  {id:"ctable",   name:"Coffee table",    w:1.2, d:.6,  h:.4,  price:4500,  c:"#5a4030", surface:true},
  {id:"tvunit",   name:"TV unit",   w:1.8, d:.45, h:.5,  price:9000,  c:"#3a3936", surface:true},
  {id:"rug",      name:"Rug",          w:2.4, d:1.7, h:.01, price:5500,  c:"#b5a189"},
  {id:"dtable",   name:"Dining table (6)",   w:1.8, d:.9,  h:.75, price:14000, c:"#6b4a33", surface:true},
  {id:"bed",      name:"Bed 160",       w:1.7, d:2.1, h:1,   price:16000, c:"#d4cec2", surface:true},
  {id:"plant",    name:"Plant",     w:.45, d:.45, h:1.2, price:1200,  c:"#4e7a4a"}
];

const byId = (arr) => Object.fromEntries(arr.map(o => [o.id, o]));
export const WM = byId(WALL_MATS), FM = byId(FLOOR_MATS), FU = byId(FURN);

// Walls are named as seen in the plan (back = top). Their real compass direction is set by the sun controls.
export const WALL_NAMES = {n:"Back wall", e:"Right wall", s:"Front wall", w:"Left wall"};
// Windows and doors are in openings.js.

// How each finish and piece is described to the AI renderer.
export const EN = {
  "bare-wall":"bare grey plaster", "paint-white":"matte white paint", "paint-sage":"sage green matte paint",
  "paint-clay":"warm terracotta matte paint", "wood-panel":"vertical walnut wood panelling", "marble-wall":"white Carrara marble slabs",
  "wallpaper":"beige wallpaper with a small diamond pattern",
  "bare-floor":"bare grey cement screed", "oak":"light oak parquet", "porcelain":"large-format light grey porcelain tiles",
  "marble-floor":"polished white marble", "concrete":"polished grey concrete",
  sofa:"grey fabric three-seat sofa", armchair:"tan upholstered armchair", ctable:"dark walnut coffee table",
  tvunit:"low dark TV cabinet with a TV above it", rug:"large beige area rug", dtable:"walnut dining table with six chairs",
  bed:"double bed with light linen bedding and a wooden headboard", plant:"tall green plant in a ceramic pot"
};

// Add the models found in public/models (from GET /api/models). Returns how many were new.
export function addModels(models){
  let added = 0;
  for (const m of models){
    if (FU[m.id]) continue;
    // table/cabinet height and deep enough to hold things -> a surface (e.g. the desk, not the chair)
    m.surface = m.h >= .3 && m.h <= 1.1 && m.d >= .45 && m.w >= .9;
    FURN.push(m); FU[m.id] = m;
    EN[m.id] = m.name.toLowerCase();
    added++;
  }
  return added;
}
