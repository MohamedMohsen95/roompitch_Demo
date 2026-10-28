// What the designer can place: wall and floor finishes, furniture, and how the AI prompt names them.
// Example prices in EGP; the designer's own prices live in settings.js. `ar` is the Arabic name.
// tex: a photo texture in public/textures/<id>/ (a Poly Haven id; npm run textures downloads it), and tile is
// then the real size of one repeat in metres (turn: rotate it a quarter, e.g. for vertical grain).
// Finishes without tex are drawn in code (textures.js).

export const WALL_MATS = [
  {id:"bare-wall",   name:"Bare plaster (unfinished)", ar:"محارة بدون تشطيب", price:0, kind:"concrete", c:"#b9b4aa", tile:2},
  {id:"paint-white", name:"Matte white paint", ar:"دهان أبيض مطفي", price:180, kind:"paint", c:"#ecebe6", tile:1},
  {id:"paint-sage",  name:"Sage green paint", ar:"دهان أخضر زيتي", price:200, kind:"paint", c:"#a7b59d", tile:1},
  {id:"paint-clay",  name:"Terracotta paint", ar:"دهان طوبي فاتح", price:200, kind:"paint", c:"#c9917a", tile:1},
  {id:"wood-panel",  name:"Wood panelling", ar:"تجاليد خشب",     price:1400, kind:"panel", c:"#9a6b43", tile:1.2},
  {id:"marble-wall", name:"Carrara marble", ar:"رخام كرارة",     price:2200, kind:"marble", c:"#e7e6e2", tile:1.4},
  {id:"wallpaper",   name:"Wallpaper", ar:"ورق حائط",       price:450, kind:"wallpaper", c:"#d6cbb5", tile:.7},
  {id:"plaster-smooth", name:"Smooth plaster", ar:"محارة ناعمة",   price:250,  kind:"paint",  c:"#c9c6c0", tex:"plastered_wall_04", tile:3.2},
  {id:"plaster-rough",  name:"Textured white plaster", ar:"محارة بيضاء خشنة", price:320, kind:"paint", c:"#d9d4ca", tex:"white_plaster_02", tile:1},
  {id:"teak-panel",     name:"Teak veneer panels", ar:"قشرة تيك",    price:2600, kind:"panel",  c:"#a8744a", tex:"teak_veneer", tile:2, turn:true},
  {id:"marble-tiles-wall", name:"Marble wall tiles", ar:"بلاط رخام للحائط", price:2400, kind:"marble", c:"#d9cdb8", tex:"marble_01", tile:1.5}
];
export const FLOOR_MATS = [
  {id:"bare-floor",   name:"Bare screed (unfinished)", ar:"لياسة خام بدون تشطيب", price:0, kind:"concrete", c:"#a9a49b", tile:2},
  {id:"oak",          name:"Oak parquet", ar:"باركيه بلوط",     price:900,  kind:"parquet", c:"#b98b5b", tile:1.4},
  {id:"porcelain",    name:"Porcelain 60×120", ar:"بورسلين 60×120",  price:650,  kind:"tiles",   c:"#d8d5cf", tile:1.2},
  {id:"marble-floor", name:"Marble", ar:"رخام",            price:2400, kind:"marble",  c:"#efeeea", tile:1.6},
  {id:"concrete",     name:"Polished concrete", ar:"خرسانة مصقولة",   price:550,  kind:"concrete",c:"#9d9f9d", tile:2},
  {id:"herringbone",  name:"Herringbone parquet", ar:"باركيه سنبلة", price:1500, kind:"parquet", c:"#a9784c", tex:"herringbone_parquet", tile:3.4},
  {id:"laminate",     name:"Oak laminate", ar:"أرضية لامينيت بلوط", price:600, kind:"parquet", c:"#b08a63", tex:"laminate_floor_02", tile:1.7},
  {id:"interior-tiles", name:"Diagonal stone tiles", ar:"بلاط حجر مائل", price:750, kind:"tiles", c:"#b3a58f", tex:"interior_tiles", tile:1.9},
  {id:"terrazzo",     name:"Terrazzo", ar:"تيرازو",        price:1100, kind:"tiles",   c:"#b8a491", tex:"terrazzo_tiles", tile:2},
  {id:"marble-tiles", name:"Marble tiles", ar:"بلاط رخام",  price:2600, kind:"marble",  c:"#d9cdb8", tex:"marble_01", tile:1.5}
];
// Built-in pieces are drawn from boxes; real 3D models from public/models are added by addModels().
// surface: other pieces can be placed on top of it (see stacking.js).
export const FURN = [
  {id:"sofa",     name:"3-seat sofa", ar:"كنبة 3 مقاعد",  w:2.2, d:.9,  h:.85, price:18000, c:"#7b898d"},
  {id:"armchair", name:"Armchair", ar:"فوتيه",          w:.85, d:.85, h:.85, price:6500,  c:"#c2a078"},
  {id:"ctable",   name:"Coffee table", ar:"ترابيزة وسط",    w:1.2, d:.6,  h:.4,  price:4500,  c:"#5a4030", surface:true},
  {id:"tvunit",   name:"TV unit", ar:"وحدة تلفزيون",   w:1.8, d:.45, h:.5,  price:9000,  c:"#3a3936", surface:true},
  {id:"rug",      name:"Rug", ar:"سجادة",          w:2.4, d:1.7, h:.01, price:5500,  c:"#b5a189"},
  {id:"dtable",   name:"Dining table (6)", ar:"سفرة 6 أفراد",   w:1.8, d:.9,  h:.75, price:14000, c:"#6b4a33", surface:true},
  {id:"bed",      name:"Bed 160", ar:"سرير 160",       w:1.7, d:2.1, h:1,   price:16000, c:"#d4cec2", surface:true},
  {id:"plant",    name:"Plant", ar:"نبات طبيعي",     w:.45, d:.45, h:1.2, price:1200,  c:"#4e7a4a"},
  // Rugs lie flat (pieces stand on them, never replace them); a textured rug shows the fabric photo on top.
  {id:"rug-plaid",    name:"Wool plaid rug", ar:"سجادة صوف كاروهات", w:2.3, d:1.6, h:.012, price:7500, c:"#7f8a6c", rug:true, tex:"fabric_pattern_05", tile:.5},
  {id:"rug-shag",     name:"Geometric shag rug", ar:"سجادة شاج بنقشة", w:2, d:1.4, h:.012, price:9500, c:"#6e4a4f", rug:true, tex:"faux_fur_geometric", tile:.3}
];
FURN.find(f => f.id === "rug").rug = true;

// Photo textures for the door leaves (windows keep white painted frames).
// turn: the photo's grain runs across, so it's turned to run up the door.
export const OPENING_TEX = {door:{tex:"dark_wood", tile:2, turn:true}};

// URLs of a texture's maps: Supabase rows bring their own (catalog-remote.js), otherwise public/textures.
export function texMaps(m){
  if (m?.texUrls) return m.texUrls;
  if (!m?.tex) return null;
  const at = (n) => `/textures/${m.tex}/${n}.webp`;
  return {base:at("base"), normal:at("normal"), arm:at("arm")};
}
export const isRug = (type) => Boolean(FU[type]?.rug);

const byId = (arr) => Object.fromEntries(arr.map(o => [o.id, o]));
export const WM = byId(WALL_MATS), FM = byId(FLOOR_MATS), FU = byId(FURN);

// Walls are numbered 1..n (t("wallN")). Windows and doors: openings.js.

// How each finish and piece is described to the AI renderer.
export const EN = {
  "bare-wall":"bare grey plaster", "paint-white":"matte white paint", "paint-sage":"sage green matte paint",
  "paint-clay":"warm terracotta matte paint", "wood-panel":"vertical walnut wood panelling", "marble-wall":"white Carrara marble slabs",
  "wallpaper":"beige wallpaper with a small diamond pattern",
  "bare-floor":"bare grey cement screed", "oak":"light oak parquet", "porcelain":"large-format light grey porcelain tiles",
  "marble-floor":"polished white marble", "concrete":"polished grey concrete",
  sofa:"grey fabric three-seat sofa", armchair:"tan upholstered armchair", ctable:"dark walnut coffee table",
  tvunit:"low dark TV cabinet with a TV above it", rug:"large beige area rug", dtable:"walnut dining table with six chairs",
  bed:"double bed with light linen bedding and a wooden headboard", plant:"tall green plant in a ceramic pot",
  "plaster-smooth":"smooth light grey plaster", "plaster-rough":"textured white lime plaster",
  "teak-panel":"vertical teak veneer wall panels", "marble-tiles-wall":"beige marble wall tiles",
  herringbone:"herringbone oak parquet", laminate:"light oak laminate planks", "interior-tiles":"diagonal beige stone floor tiles",
  terrazzo:"terrazzo floor tiles", "marble-tiles":"beige marble floor tiles",
  "rug-plaid":"green and beige wool plaid rug", "rug-shag":"plum shag rug with a geometric pattern"
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

// Apply catalog_items rows from Supabase (see catalog-remote.js), which win over the entries above:
// an id the code knows is updated in place (lists hold the same objects), a new id is added.
// Returns how many entries changed or were added.
export function applyCatalog(rows){
  const lists = {furniture:[FURN, FU], wall_finish:[WALL_MATS, WM], floor_finish:[FLOOR_MATS, FM]};
  let n = 0;
  for (const r of rows){
    const [list, index] = lists[r.kind] || [];
    if (!list) continue;
    const e = {id:r.id, name:r.name_en, ar:r.name_ar || undefined, price:Number(r.price) || 0, c:r.color || "#8a8580"};
    if (r.kind === "furniture") Object.assign(e, {w:r.w, d:r.d, h:r.h, surface:r.surface, model:r.modelUrl || undefined, rug:r.category === "rug"});
    else Object.assign(e, {kind:r.material || "paint"});
    if (r.textures?.tile) e.tile = r.textures.tile;
    if (r.textures?.turn) e.turn = true;
    if (r.texUrls) e.texUrls = r.texUrls;
    if (index[r.id]) Object.assign(index[r.id], e); else { list.push(e); index[r.id] = e; }
    EN[r.id] = r.ai_description || r.name_en.toLowerCase();
    n++;
  }
  return n;
}
