/**
 * Almost silence: a distant ocean, wind, now and then a bird, and a single bell every few minutes.
 * Everything is generated (Web Audio), nothing is downloaded, and nothing plays until the visitor asks.
 */
import type { Scene } from "./scenes";

let ctx: AudioContext | null = null;
let master: GainNode, ocean: GainNode, wind: GainNode;
let scene: Scene = "ocean";
let timers: number[] = [];

const LEVELS: Record<Scene, { ocean: number; wind: number }> = {
  ocean: { ocean: 0.55, wind: 0.06 },
  forest: { ocean: 0.04, wind: 0.2 },
  autumn: { ocean: 0, wind: 0.26 },
  lake: { ocean: 0.3, wind: 0 }, // muffled, beneath the surface
  wetland: { ocean: 0.12, wind: 0.14 },
  desert: { ocean: 0, wind: 0.34 },
  polar: { ocean: 0.22, wind: 0.3 },
  amazon: { ocean: 0.08, wind: 0.2 },
};

function brownNoise(c: AudioContext, seconds = 6) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function bell() {
  if (!ctx) return;
  const now = ctx.currentTime, base = 196; // a low singing bowl
  [1, 2.76, 5.4, 8.93].forEach((m, i) => {
    const o = ctx!.createOscillator(), g = ctx!.createGain();
    o.frequency.value = base * m;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09 / (i + 1), now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 9 - i * 1.5);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + 10);
  });
}

function bird() {
  if (!ctx || !["forest", "amazon", "wetland"].includes(scene)) return;
  const now = ctx.currentTime;
  for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
    const t = now + k * 0.16, o = ctx.createOscillator(), g = ctx.createGain();
    const f = 2600 + Math.random() * 1600;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.3), t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.012, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.14);
  }
}

function every(fn: () => void, min: number, max: number) {
  const next = () => {
    timers.push(window.setTimeout(() => {
      fn();
      next();
    }, (min + Math.random() * (max - min)) * 1000));
  };
  next();
}

export function startAmbience() {
  if (ctx) {
    void ctx.resume();
    master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.2);
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  // the ocean: low noise that swells and settles, about six breaths a minute
  const sea = brownNoise(ctx), lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  ocean = ctx.createGain();
  const swell = ctx.createOscillator(), depth = ctx.createGain();
  swell.frequency.value = 0.1;
  depth.gain.value = 0.25;
  swell.connect(depth).connect(ocean.gain);
  sea.connect(lp).connect(ocean).connect(master);
  // the wind: a wider, higher hush
  const air = brownNoise(ctx, 5), bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.5;
  wind = ctx.createGain();
  air.connect(bp).connect(wind).connect(master);
  sea.start();
  air.start();
  swell.start();
  setAmbienceScene(scene);
  master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);
  every(bell, 110, 240);
  every(bird, 9, 26);
  every(() => {
    // the wind is never the same for long
    if (ctx) bp.frequency.setTargetAtTime(600 + Math.random() * 700, ctx.currentTime, 3);
  }, 6, 14);
  timers.push(window.setTimeout(bell, 4000));
}

export function stopAmbience() {
  if (!ctx) return;
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
  const c = ctx;
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
  window.setTimeout(() => {
    void c.close();
  }, 2500);
  ctx = null;
}

export function setAmbienceScene(s: Scene) {
  scene = s;
  if (!ctx) return;
  const l = LEVELS[s];
  ocean.gain.setTargetAtTime(l.ocean, ctx.currentTime, 2.5);
  wind.gain.setTargetAtTime(l.wind, ctx.currentTime, 2.5);
}
