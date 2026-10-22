import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/analyze.js";

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
  for (const k of ["CF_ACCOUNT_ID", "CF_API_TOKEN", "ACCESS_CODE", "CF_VISION_MODEL"]) delete process.env[k];
  globalThis.fetch = async () => { throw new Error("fetch not stubbed"); };
});

const withKeys = () => { process.env.CF_ACCOUNT_ID = "acc"; process.env.CF_API_TOKEN = "tok"; };

test("GET says whether analysis is available and which model", async () => {
  withKeys();
  const r = await call("GET");
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, true);
  assert.equal(r.body.model, "@cf/meta/llama-4-scout-17b-16e-instruct");
});

test("no Cloudflare keys returns an error", async () => {
  const r = await call("POST", {image:IMG});
  assert.equal(r.status, 503);
  assert.ok(r.body.error);
});

test("wrong access code returns 401", async () => {
  withKeys(); process.env.ACCESS_CODE = "secret";
  const r = await call("POST", {image:IMG}, {"x-access-code":"nope"});
  assert.equal(r.status, 401);
});

test("model reply is parsed into openings", async () => {
  withKeys();
  let sent = null;
  globalThis.fetch = async (url, opts) => {
    sent = {url, body:JSON.parse(opts.body)};
    return new Response(JSON.stringify({success:true, result:{response:'```json {"openings":[{"type":"door","left":0.1,"right":0.3,"top":0.2,"bottom":1}]}```'}}), {status:200});
  };
  const r = await call("POST", {image:IMG});
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.openings, [{type:"door", left:0.1, right:0.3, top:0.2, bottom:1}]);
  assert.match(sent.url, /accounts\/acc\/ai\/run\/@cf\/meta\/llama-4-scout-17b-16e-instruct$/);
  const parts = sent.body.messages[0].content;
  assert.equal(parts[1].image_url.url, IMG);
});

test("daily allowance used up maps to 502 with a clear message", async () => {
  withKeys();
  globalThis.fetch = async () => new Response(JSON.stringify({success:false, errors:[{message:"daily neuron limit"}]}), {status:429});
  const r = await call("POST", {image:IMG});
  assert.equal(r.status, 502);
  assert.match(r.body.error, /allowance/);
});
