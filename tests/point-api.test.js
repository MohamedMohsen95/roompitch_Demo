import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/point.js";

const IMG = "data:image/jpeg;base64," + "A".repeat(100);

function call(method, body, headers = {}){
  return new Promise((resolve) => {
    const res = {
      headers:{}, statusCode:200,
      setHeader(k, v){ this.headers[k] = v; },
      status(c){ this.statusCode = c; return this; },
      json(o){ resolve({status:this.statusCode, body:o}); return this; }
    };
    handler({method, body, headers}, res);
  });
}

beforeEach(() => {
  for (const k of ["CF_ACCOUNT_ID", "CF_API_TOKEN", "ACCESS_CODE", "CF_VISION_MODEL", "CF_PLAN_MODEL", "MOONDREAM_MODEL"]) delete process.env[k];
  globalThis.fetch = async () => { throw new Error("fetch not stubbed"); };
});

const withKeys = () => { process.env.CF_ACCOUNT_ID = "acc"; process.env.CF_API_TOKEN = "tok"; };

test("GET: Moondream by default, MOONDREAM_MODEL overrides", async () => {
  withKeys();
  assert.equal((await call("GET")).body.model, "@cf/moondream/moondream3.1-9B-A2B");
  process.env.MOONDREAM_MODEL = "@cf/x";
  assert.equal((await call("GET")).body.model, "@cf/x");
  delete process.env.MOONDREAM_MODEL;
});

test("no keys 503, wrong code 401, bad names 400", async () => {
  assert.equal((await call("POST", {image:IMG, names:["A"]})).status, 503);
  withKeys(); process.env.ACCESS_CODE = "s";
  assert.equal((await call("POST", {image:IMG, names:["A"]}, {"x-access-code":"no"})).status, 401);
  delete process.env.ACCESS_CODE;
  assert.equal((await call("POST", {image:IMG, names:"A"})).status, 400);
});

test("one point call per distinct name, mapped back to the names", async () => {
  withKeys();
  const bodies = [];
  globalThis.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body); bodies.push(b);
    const pts = b.target.includes("BEDROOM") ? [{x:.2, y:.3}, {x:.7, y:.3}] : [{x:400, y:100}];
    return new Response(JSON.stringify({success:true, result:{points:pts}}), {status:200});
  };
  const r = await call("POST", {image:IMG, w:1000, h:500, names:["BEDROOM", "KITCHEN", "BEDROOM"]});
  assert.equal(r.status, 200);
  assert.equal(bodies.length, 2);
  assert.ok(bodies.every(b => b.task === "point" && b.image === IMG));
  assert.deepEqual(r.body.points, {BEDROOM:[[.2, .3], [.7, .3]], KITCHEN:[[.4, .2]]});
});

test("allowance used up maps to 502", async () => {
  withKeys();
  globalThis.fetch = async () => new Response(JSON.stringify({success:false, errors:[{message:"daily neuron limit"}]}), {status:429});
  const r = await call("POST", {image:IMG, names:["A"]});
  assert.equal(r.status, 502);
  assert.match(r.body.error, /allowance/);
});
