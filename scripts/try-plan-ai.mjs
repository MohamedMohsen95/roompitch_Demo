// Try fal.ai image models on floor plans, to see which could help the plan reading (src/studio/plan/).
// A throwaway comparison, not part of the app. Each model gets the plan and is asked to redraw it as a
// colour-coded mask (walls black, windows blue, doors red, railings green); SAM 3 is asked for masks instead.
// What comes back is saved under tests/fixtures/plans/check/ai/<plan>/ (git-ignored).
//
//   node scripts/try-plan-ai.mjs                       ex4 and east (the two hardest test plans), the four new models
//   node scripts/try-plan-ai.mjs my-plan.jpg ...       your own plans
//   node scripts/try-plan-ai.mjs --only nb2,qwen ...   only some of the models (keys below)
//   node scripts/try-plan-ai.mjs --all-plans           the four test plans
//
// Models (key: model, about what it costs per plan at the sizes asked for here):
//   nb2      Nano Banana 2 edit, 2K                          ~$0.12
//   qwen     Qwen Image Edit 2511, ~2 MP                     ~$0.06
//   seedream Seedream 4.5 edit, ~4 MP (its minimum)          ~$0.04
//   flux2    FLUX.2 [pro] edit, ~2 MP                        ~$0.06
//   nbpro    Nano Banana Pro edit, 2K                        ~$0.15
//   nb       Nano Banana edit (tried before: ignored the prompt)   ~$0.04
//   sam3     SAM 3 "wall"/"door"/"window" (tried before: found nothing)  ~$0.015
//
// Needs FAL_KEY in .env (the same key as api/generate.js and api/object3d.js) and Node 20+.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "tests/fixtures/plans/check/ai");

// FAL_KEY from the environment, or else from .env
function falKey(){
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)){
    const m = line.match(/^\s*FAL_KEY\s*=\s*(.*)$/);
    if (m) return m[1].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

// Second version, after the first round: doors as one straight line across the opening (no swing, no
// leaf), closets not green, columns black, closet doors gone.
const PROMPT = `Redraw this architectural floor plan as a clean technical mask on a pure white background. Keep every wall exactly where it is, at the same scale and proportions, with the same image framing.
Colors:
- Walls, interior and exterior, and structural columns: solid pure black (#000000), filled, same thickness as in the original.
- Windows: solid pure blue (#0000FF), only the part of the wall line where the window is.
- Doors: ONE straight solid pure red (#FF0000) line lying exactly in the wall's line, across the full door opening, as thick as the wall. Do not draw the door leaf, the swing arc or any line going into the room.
- Balcony and terrace railings on the outside edge of the plan: solid pure green (#00FF00). Nothing else is green.
- Open passages with no door: leave the gap white.
Remove everything else: furniture, kitchen counters, closets and their shelves, wardrobe and sliding closet doors, bathroom fixtures, text, room names, dimensions, hatching, floor patterns, colors, shadows, logos.
Do not add, remove, move or straighten any wall. Flat colors only, no anti-aliasing, no gradients.`;

// Image size from the file (PNG or JPEG), to ask each model for the plan's own proportions.
function imageSize(buf){
  if (buf.readUInt32BE(0) === 0x89504e47) return {w:buf.readUInt32BE(16), h:buf.readUInt32BE(20)};
  if (buf[0] === 0xff && buf[1] === 0xd8){
    let p = 2;
    while (p < buf.length){
      if (buf[p] !== 0xff){ p++; continue; }
      const marker = buf[p + 1], len = buf.readUInt16BE(p + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {w:buf.readUInt16BE(p + 7), h:buf.readUInt16BE(p + 5)};
      p += 2 + len;
    }
  }
  throw new Error("can't read the image size (PNG or JPEG only)");
}
// The plan's proportions at about `mp` megapixels, each side at least `min` px (multiples of 16)
function sizeAt({w, h}, mp, min = 0){
  let k = Math.sqrt(mp * 1e6 / (w * h));
  k = Math.max(k, min / Math.min(w, h));
  const r16 = (v) => Math.round(v * k / 16) * 16;
  return {width:r16(w), height:r16(h)};
}

const edit = (model, extra) => ({run:async (img, size) => fal(model, {prompt:PROMPT, image_urls:[img], ...extra(size)})});
const MODELS = {
  nb2:{label:"Nano Banana 2", cost:0.12, ...edit("fal-ai/nano-banana-2/edit", () => ({resolution:"2K", aspect_ratio:"auto", output_format:"png"}))},
  qwen:{label:"Qwen Image Edit 2511", cost:0.06, ...edit("fal-ai/qwen-image-edit-2511", (s) => ({image_size:sizeAt(s, 2), output_format:"png"}))},
  seedream:{label:"Seedream 4.5", cost:0.04, ...edit("fal-ai/bytedance/seedream/v4.5/edit", (s) => ({image_size:sizeAt(s, 4, 1920)}))},
  flux2:{label:"FLUX.2 Pro", cost:0.06, ...edit("fal-ai/flux-2-pro/edit", (s) => ({image_size:sizeAt(s, 2), output_format:"png"}))},
  nbpro:{label:"Nano Banana Pro", cost:0.15, ...edit("fal-ai/nano-banana-pro/edit", () => ({resolution:"2K", output_format:"png"}))},
  nb:{label:"Nano Banana", cost:0.04, ...edit("fal-ai/nano-banana/edit", () => ({output_format:"png"}))},
  sam3:{label:"SAM 3", cost:0.015, sam:true, run:async (img) => {
    const out = {};
    for (const prompt of ["wall", "door", "window"]){
      out[prompt] = await fal("fal-ai/sam-3/image", {image_url:img, prompt, apply_mask:true, return_multiple_masks:true,
        max_masks:32, include_scores:true, include_boxes:true, output_format:"png"});
    }
    return out;
  }}
};
const DEFAULT_MODELS = ["nb2", "qwen", "seedream", "flux2"];

let KEY = "";
async function fal(model, input){
  const r = await fetch(`https://fal.run/${model}`, {method:"POST",
    headers:{Authorization:`Key ${KEY}`, "Content-Type":"application/json"}, body:JSON.stringify(input),
    signal:AbortSignal.timeout(240_000)});
  const data = await r.json().catch(() => ({}));
  if (!r.ok){
    const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || data).slice(0, 400);
    throw new Error(`${model}: ${r.status} ${detail}`);
  }
  return data;
}

async function save(url, file){
  if (url.startsWith("data:")){ writeFileSync(file, Buffer.from(url.split(",")[1], "base64")); return; }
  const r = await fetch(url, {signal:AbortSignal.timeout(60_000)});
  if (!r.ok) throw new Error(`download ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

const dataUri = (file) => {
  const ext = extname(file).toLowerCase().slice(1), type = ext === "jpg" ? "jpeg" : ext;
  return `data:image/${type};base64,${readFileSync(file).toString("base64")}`;
};

async function main(){
  KEY = falKey();
  if (!KEY){ console.error("FAL_KEY is empty: put your fal.ai key in .env (FAL_KEY=...)"); process.exit(1); }
  const args = process.argv.slice(2);
  let only = DEFAULT_MODELS, names = ["ex4", "east"];
  const i = args.indexOf("--only");
  if (i >= 0){
    only = (args[i + 1] || "").split(",").filter(k => MODELS[k]);
    if (!only.length){ console.error(`--only takes some of: ${Object.keys(MODELS).join(",")}`); process.exit(1); }
    args.splice(i, 2);
  }
  const a = args.indexOf("--all-plans");
  if (a >= 0){ names = ["arcmax", "etsy", "ex4", "east"]; args.splice(a, 1); }
  const plans = args.length ? args.map(p => resolve(p)) : names.map(n => join(ROOT, `tests/fixtures/plans/src/${n}.png`));
  const total = plans.length * only.reduce((s, k) => s + MODELS[k].cost, 0);
  console.log(`${plans.length} plan(s) × ${only.map(k => MODELS[k].label).join(", ")} ≈ $${total.toFixed(2)}`);

  const summary = [];
  for (const plan of plans){
    const name = basename(plan, extname(plan)), dir = join(OUT, name);
    mkdirSync(dir, {recursive:true});
    const buf = readFileSync(plan), size = imageSize(buf);
    writeFileSync(join(dir, "original" + extname(plan)), buf);
    writeFileSync(join(dir, "prompt.txt"), PROMPT);
    const img = dataUri(plan);
    for (const key of only){
      const t0 = Date.now();
      process.stdout.write(`${name} · ${MODELS[key].label} … `);
      try {
        const r = await MODELS[key].run(img, size);
        if (MODELS[key].sam){
          for (const [prompt, res] of Object.entries(r)){
            if (res.image?.url) await save(res.image.url, join(dir, `sam3_${prompt}_overlay.png`));
            for (const [j, m] of (res.masks || []).entries()) await save(m.url, join(dir, `sam3_${prompt}_mask${j + 1}.png`));
            writeFileSync(join(dir, `sam3_${prompt}.json`), JSON.stringify({scores:res.scores, boxes:res.boxes, metadata:res.metadata}, null, 2));
          }
        } else {
          const out = r.images?.[0];
          if (!out?.url) throw new Error("no image came back: " + JSON.stringify(r).slice(0, 200));
          const ext = (out.content_type || "").includes("jpeg") ? ".jpg" : (out.content_type || "").includes("webp") ? ".webp" : ".png";
          await save(out.url, join(dir, `${key}${ext}`));
        }
        const s = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`done in ${s} s`);
        summary.push({plan:name, model:key, ok:true, seconds:Number(s)});
      } catch (err){
        console.log(`FAILED: ${err.message}`);
        summary.push({plan:name, model:key, ok:false, error:err.message});
      }
    }
  }
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nSaved in ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
