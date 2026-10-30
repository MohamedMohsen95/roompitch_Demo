import { test } from "node:test";
import assert from "node:assert/strict";

const { FURN, FU, WM, FLOOR_MATS, EN, applyCatalog, furnCat } = await import("../src/studio/catalog.js");

test("applyCatalog updates known ids in place and adds new ones", () => {
  const sofa = FU.sofa, count = FURN.length, floors = FLOOR_MATS.length;
  const n = applyCatalog([
    {id:"sofa", kind:"furniture", name_en:"Sofa", name_ar:null, ai_description:"a sofa", w:2, d:1, h:.8, surface:false, price:"17000.00", color:"#111111"},
    {id:"m-new", kind:"furniture", name_en:"Lamp", w:.4, d:.4, h:1.6, surface:false, price:900, color:null, modelUrl:"https://x/lamp.glb"},
    {id:"cork", kind:"floor_finish", name_en:"Cork", price:1200, color:"#ddd", material:"tiles", textures:{tile:.6}},
    {id:"odd", kind:"ceiling", name_en:"Ignored"}
  ]);
  assert.equal(n, 3);
  assert.equal(FU.sofa, sofa);                       // same object, so lists and saved rooms keep working
  assert.equal(sofa.price, 17000);                   // numeric arrives as a string from PostgREST
  assert.equal(EN.sofa, "a sofa");
  assert.equal(FURN.length, count + 1);
  assert.equal(FU["m-new"].model, "https://x/lamp.glb");
  assert.equal(EN["m-new"], "lamp");
  assert.equal(FLOOR_MATS.length, floors + 1);
  assert.equal(FLOOR_MATS.at(-1).tile, .6);
  assert.equal(WM.odd, undefined);
});

test("furniture groups: catalog category first, else guessed from the name", () => {
  const g = (name, extra = {}) => furnCat({id:"x", name, price:0, c:"#000", w:1, d:1, h:1, ...extra});
  assert.equal(g("Dining chair 02"), "seating");
  assert.equal(g("Dining table (6)"), "table");
  assert.equal(g("Metal office desk"), "table");
  assert.equal(g("TV unit"), "storage");
  assert.equal(g("Bed 160"), "bed");
  assert.equal(g("Potted plant 01"), "decor");
  assert.equal(g("Wool plaid rug", {rug:true}), "rug");
  assert.equal(g("Lounge thing", {cat:"seating"}), "seating");
  assert.equal(g("Lounge thing", {cat:"spaceship"}), "other");
});
