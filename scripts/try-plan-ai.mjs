// Try fal.ai models on floor plans, to see which could help the plan reading (src/studio/plan/).
// A throwaway comparison, not part of the app: it sends each plan to
//   - SAM 3 (fal-ai/sam-3/image): masks of "wall", "door" and "window" on the plan's own pixels   ~$0.005 each
//   - Nano Banana (fal-ai/nano-banana/edit): the plan redrawn as a colour-coded mask             ~$0.04
//   - Nano Banana Pro (fal-ai/nano-banana-pro/edit), same prompt at 2K                           ~$0.15
// and saves what comes back under tests/fixtures/plans/check/ai/<plan>/ (git-ignored).
// The four test plans cost about $0.85 in all.
//
//   node scripts/try-plan-ai.mjs                       the four test plans (tests/fixtures/plans/src/*.png)
//   node scripts/try-plan-ai.mjs my-plan.jpg ...       your own plans
//   node scripts/try-plan-ai.mjs --only sam3,nb ...    only some of the models (sam3, nb, nbpro)
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

const PROMPT = `Redraw this architectural floor plan as a clean technical mask on a pure white background, keeping every wall exactly where it is, at the same scale and proportions, same image size.
- All walls (interior and exterior): solid pure black (#000000), filled, same thickness as in the original.
- Windows: solid pure blue (#0000FF) segments inside the wall line.
- Doors: solid pure red (#FF0000) segment across the door opening in the wall (no swing arc).
- Balcony railings and low walls: solid pure green (#00FF00).
- Remove everything else: furniture, fixtures, text, room names, dimensions, hatching, colors, shadows, logos.
Do not add, remove, move or straighten any wall. Flat colors only, no anti-aliasing, no gradients.`;

const MODELS = {
  sam3:{label:"SAM 3", cost:0.015, run:async (img) => {
    const out = {};
    for (const prompt of ["wall", "door", "window"]){
      const r = await fal("fal-ai/sam-3/image", {image_url:img, prompt, apply_mask:true, return_multiple_masks:true,
        max_masks:32, include_scores:true, include_boxes:true, output_format:"png"});
      out[prompt] = r;
    }
    return out;
  }},
  nb:{label:"Nano Banana", cost:0.04, run:(img) => fal("fal-ai/nano-banana/edit", {prompt:PROMPT, image_urls:[img], output_format:"png"})},
  nbpro:{label:"Nano Banana Pro", cost:0.15, run:(img) => fal("fal-ai/nano-banana-pro/edit", {prompt:PROMPT, image_urls:[img], resolution:"2K", output_format:"png"})}
};

let KEY = "";
async function fal(model, input){
  const r = await fetch(`https://fal.run/${model}`, {method:"POST",
    headers:{Authorization:`Key ${KEY}`, "Content-Type":"application/json"}, body:JSON.stringify(input),
    signal:AbortSignal.timeout(180_000)});
  const data = await r.json().catch(() => ({}));
  if (!r.ok){
    const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || data).slice(0, 300);
    throw new Error(`${model}: ${r.status} ${detail}`);
  }
  return data;
}

async function save(url, file){
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
  let only = Object.keys(MODELS);
  const i = args.indexOf("--only");
  if (i >= 0){ only = args[i + 1].split(",").filter(k => MODELS[k]); args.splice(i, 2); }
  const plans = args.length ? args.map(a => resolve(a))
    : ["arcmax", "etsy", "ex4", "east"].map(n => join(ROOT, `tests/fixtures/plans/src/${n}.png`));
  const total = plans.length * only.reduce((a, k) => a + MODELS[k].cost, 0);
  console.log(`${plans.length} plan(s) × ${only.map(k => MODELS[k].label).join(", ")} ≈ $${total.toFixed(2)}`);

  const summary = [];
  for (const plan of plans){
    const name = basename(plan, extname(plan)), dir = join(OUT, name);
    mkdirSync(dir, {recursive:true});
    writeFileSync(join(dir, "original" + extname(plan)), readFileSync(plan));
    const img = dataUri(plan);
    for (const key of only){
      const t0 = Date.now();
      process.stdout.write(`${name} · ${MODELS[key].label} … `);
      try {
        const r = await MODELS[key].run(img);
        if (key === "sam3"){
          for (const [prompt, res] of Object.entries(r)){
            if (res.image?.url) await save(res.image.url, join(dir, `sam3_${prompt}_overlay.png`));
            for (const [j, m] of (res.masks || []).entries()) await save(m.url, join(dir, `sam3_${prompt}_mask${j + 1}.png`));
            writeFileSync(join(dir, `sam3_${prompt}.json`), JSON.stringify({scores:res.scores, boxes:res.boxes, metadata:res.metadata}, null, 2));
          }
        } else {
          const url = r.images?.[0]?.url;
          if (!url) throw new Error("no image came back");
          await save(url, join(dir, `${key}.png`));
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
