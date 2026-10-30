// Walk mode's sounds: a gentle chime as you blink into the room, and a soft carpet-like footstep for
// every stride (a little louder and quicker when running). They're made on the spot with the Web Audio API, so there is nothing
// to download, and each step varies a little so it never sounds like a loop. On unless the designer mutes it
// (remembered in this browser).
import { notify } from "../store.js";

const MUTE_KEY = "rp_walk_sound_off";
const STEP_VOLUME = .45;   // footsteps stay low, in the background
const CHIME_AT = .74;      // seconds after the click: when the second blink has closed (studio.css .blink)
let ctx = null, noise = null;
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(on){
  muted = on;
  try { if (on) localStorage.setItem(MUTE_KEY, "1"); else localStorage.removeItem(MUTE_KEY); } catch { /* private window: lasts until reload */ }
  notify();
}

// Start the audio. Browsers only allow it after a click, so this is called from one (entering walk mode).
export function wakeAudio(){
  if (!ctx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // pink-ish noise: softer and warmer than white noise
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++){
      const w = Math.random() * 2 - 1;
      b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * .1848) * .2;
    }
  }
  if (ctx.state === "suspended") ctx.resume();
}

const rand = (a, b) => a + Math.random() * (b - a);
// A gain that rises to `peak` in `attack` seconds and dies away by `end`.
function envelope(t, peak, attack, end){
  const g = ctx.createGain();
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t + end);
  return g;
}
function noiseFrom(t, dur){
  const n = ctx.createBufferSource();
  n.buffer = noise; n.playbackRate.value = rand(.85, 1.15);
  n.start(t, rand(0, .5)); n.stop(t + dur);
  return n;
}

const filter = (type, freq, q = .7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };

// One footstep: soft and low, like walking on a rug. A muffled press of the heel, then a quieter one of the toe.
export function stepSound(running){
  if (!ctx || muted || ctx.state !== "running") return;
  const t = ctx.currentTime, out = ctx.createGain();
  out.gain.value = STEP_VOLUME * (running ? 1.3 : 1);
  out.connect(ctx.destination);
  noiseFrom(t, .25).connect(filter("lowpass", 300, .6)).connect(filter("peaking", 160, 1)).connect(envelope(t, .32, .03, .2)).connect(out);
  noiseFrom(t + .06, .2).connect(filter("lowpass", 260, .6)).connect(envelope(t + .06, .16, .03, .17)).connect(out);
}

// Blinking in: a soft, low two-note chime as the second (slower) blink closes, ringing on as the eyes open.
export function blinkSound(){
  if (!ctx || muted) return;
  const t = ctx.currentTime + CHIME_AT;
  for (const [freq, peak] of [[392, .07], [587.3, .04]]){
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    o.connect(envelope(t, peak, .05, 1.1)).connect(ctx.destination);
    o.start(t); o.stop(t + 1.15);
  }
}
