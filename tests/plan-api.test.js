import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/plan.js";

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
  for (const k of ["CF_ACCOUNT_ID", "CF_API_TOKEN", "ACCESS_CODE", "CF_VISION_MODEL", "CF_PLAN_MODEL"]) delete process.env[k];
  globalThis.fetch = async () => { throw new Error("fetch not stubbed"); };
});

const withKeys = () => { process.env.CF_ACCOUNT_ID = "acc"; process.env.CF_API_TOKEN = "tok"; };

test("GET: model falls back from CF_PLAN_MODEL to CF_VISION_MODEL to the default", async () => {
  withKeys();
  assert.equal((await call("GET")).body.model, "@cf/meta/llama-4-scout-17b-16e-instruct");
  process.env.CF_VISION_MODEL = "@cf/v";
  assert.equal((await call("GET")).body.model, "@cf/v");
  process.env.CF_PLAN_MODEL = "@cf/p";
  const r = await call("GET");
  assert.deepEqual(r.body, {enabled:true, model:"@cf/p"});
});

test("no Cloudflare keys returns 503", async () => {
  const r = await call("POST", {image:IMG});
  assert.equal(r.status, 503);
});

test("wrong access code returns 401", async () => {
  withKeys(); process.env.ACCESS_CODE = "secret";
  assert.equal((await call("POST", {image:IMG}, {"x-access-code":"nope"})).status, 401);
});

test("a fenced reply is parsed into spaces and openings", async () => {
  withKeys();
  let sent = null;
  const reply = {spaces:[{name:"DEN", outline:[[0, 0], [0.5, 0], [0.5, 0.5]], size:"9' x 9'"}], openings:[]};
  globalThis.fetch = async (url, opts) => {
    sent = {url, body:JSON.parse(opts.body)};
    return new Response(JSON.stringify({success:true, result:{response:"```json " + JSON.stringify(reply) + "```"}}), {status:200});
  };
  const r = await call("POST", {image:IMG});
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, reply);
  assert.equal(sent.body.max_tokens, 2000);
  assert.equal(sent.body.messages[0].content[1].image_url.url, IMG);
});

test("allowance used up maps to 502", async () => {
  withKeys();
  globalThis.fetch = async () => new Response(JSON.stringify({success:false, errors:[{message:"daily neuron limit"}]}), {status:429});
  const r = await call("POST", {image:IMG});
  assert.equal(r.status, 502);
  assert.match(r.body.error, /allowance/);
});
