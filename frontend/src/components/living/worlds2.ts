/**
 * Five more worlds of the Living Universe, each a whole ecosystem:
 *   lake     beneath the surface of a lake: light through water, weed, stones, schools of fish, a turtle, a crab
 *   wetland  reeds and lotus on still water: a heron, ducks, frogs, a kingfisher, dragonflies
 *   desert   dunes in haze or starlight: wind-blown sand, a cactus, a caravan, a fennec fox, a tumbleweed
 *   polar    ice and sea under an aurora: a polar bear, seals, penguins, a walrus, orcas surfacing
 *   amazon   the great river forest: palms and broad leaves, macaws, a toucan, a sloth, a jaguar, river dolphins
 * Like the others, nothing loops; every creature keeps its own time, and the light follows the visitor's clock.
 */
import type { World } from "./engine";
import { clamp, easeInOut, GOLDEN_ANGLE, lerp, mix, noise, type RGB, rgba, rnd, seeded, TAU } from "./kit";

export interface Living {
  layout(): void;
  step(dt: number): void;
  draw(): void;
  touch?(x: number, y: number): boolean; // true: the scene answered the touch itself
}

const ink = (w: World, day: RGB, night: RGB, a = 0.92) => rgba(mix(night, day, w.lightNow), a);

function sky(w: World, top: [RGB, RGB], low: [RGB, RGB], until: number) {
  const c = w.ctx, L = w.lightNow;
  const g = c.createLinearGradient(0, 0, 0, until);
  g.addColorStop(0, rgba(mix(top[1], top[0], L)));
  g.addColorStop(1, rgba(mix(low[1], low[0], L)));
  c.fillStyle = g;
  c.fillRect(-20, -20, w.W + 40, until + 40);
}

// ═══════════════════════════ The lake, from beneath ═══════════════════════════
interface Fish { ox: number; oy: number; s: number; ph: number }
interface School { x: number; y: number; vx: number; vy: number; id: number; fish: Fish[]; col: RGB }

export class Lake implements Living {
  private weeds: { x: number; h: number; n: number; p: number; col: RGB }[] = [];
  private stones: { x: number; r: number; c: RGB }[] = [];
  private bubbles: { x: number; y: number; r: number; v: number; p: number }[] = [];
  private schools: School[] = [];
  private big: { x: number; y: number; dir: number; s: number; ph: number }[] = [];
  private turtle = { on: false, x: 0, y: 0, dir: 1, next: rnd(30, 70) };
  private crab = { x: 0, dir: 1, timer: 0 };
  constructor(private w: World) {}

  private bed() {
    return this.w.H * 0.88;
  }

  layout() {
    const { W, H, mobile } = this.w, r = seeded(31);
    this.weeds = Array.from({ length: mobile ? 12 : 26 }, (_, i) => ({
      x: (i / (mobile ? 12 : 26)) * W + r() * 50, h: H * (0.18 + r() * 0.32), n: 2 + Math.floor(r() * 3), p: r() * TAU,
      col: [[70, 120, 70], [90, 140, 80], [60, 110, 90]][Math.floor(r() * 3)] as RGB,
    }));
    this.stones = Array.from({ length: mobile ? 8 : 16 }, () => ({ x: r() * W, r: 8 + r() * 26, c: [[120, 120, 110], [100, 96, 90], [140, 130, 116]][Math.floor(r() * 3)] as RGB }));
    this.schools = Array.from({ length: mobile ? 1 : 2 }, (_, k) => ({
      x: r() * W, y: H * (0.3 + r() * 0.35), vx: 20, vy: 0, id: k, col: k ? [190, 200, 196] : [210, 186, 120],
      fish: Array.from({ length: mobile ? 7 : 11 }, (_, i) => ({ ox: Math.cos(i * GOLDEN_ANGLE) * Math.sqrt(i) * 16, oy: Math.sin(i * GOLDEN_ANGLE) * Math.sqrt(i) * 9, s: 0.8 + r() * 0.5, ph: r() * TAU })),
    }));
    this.big = [{ x: W * 0.3, y: H * 0.62, dir: 1, s: 2.3, ph: 0 }, { x: W * 0.8, y: H * 0.45, dir: -1, s: 1.8, ph: 2 }];
    this.crab.x = W * 0.42;
  }

  touch(x: number, y: number) {
    for (let i = 0; i < 9; i++) this.bubbles.push({ x: x + rnd(-8, 8), y: y + rnd(-6, 6), r: rnd(1.5, 4), v: rnd(30, 60), p: Math.random() * TAU });
    for (const s of this.schools) if (Math.hypot(s.x - x, s.y - y) < 260) (s.vx += (s.x - x) * 0.6), (s.vy += (s.y - y) * 0.6);
    return true;
  }

  step(dt: number) {
    const w = this.w, { W, H } = w, rich = Math.min(1, w.idleNow / 40);
    if (Math.random() < dt * (1.2 + rich * 2)) this.bubbles.push({ x: rnd(0, W), y: this.bed() - 4, r: rnd(1, 3.2), v: rnd(18, 40), p: Math.random() * TAU });
    for (const b of this.bubbles) {
      b.y -= b.v * dt;
      b.x += Math.sin(w.t * 2 + b.p) * 10 * dt;
    }
    this.bubbles = this.bubbles.filter((b) => b.y > H * 0.04).slice(-90);
    for (const s of this.schools) {
      const a = noise(w.t * 0.08 + s.id * 17) * TAU * 2;
      s.vx = lerp(s.vx, Math.cos(a) * 34, dt * 0.6);
      s.vy = lerp(s.vy, Math.sin(a) * 14, dt * 0.6);
      const p = w.pointerNow, dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy);
      if (d < 150) (s.vx += (dx / d) * 120 * dt), (s.vy += (dy / d) * 120 * dt);
      s.x += s.vx * dt;
      s.y = clamp(s.y + s.vy * dt, H * 0.16, this.bed() - 40);
      if (s.x > W + 120) s.x = -120;
      if (s.x < -120) s.x = W + 120;
    }
    for (const f of this.big) {
      f.x += f.dir * 12 * dt;
      f.y += Math.sin(w.t * 0.2 + f.ph) * 4 * dt;
      if (f.x > W + 140 || f.x < -140) (f.dir *= -1), (f.y = rnd(H * 0.3, H * 0.7));
    }
    const t = this.turtle;
    if (!t.on) {
      t.next -= dt * (1 + rich);
      if (t.next < 0) Object.assign(t, { on: true, dir: Math.random() < 0.5 ? 1 : -1, y: rnd(H * 0.3, H * 0.6) }), (t.x = t.dir > 0 ? -60 : W + 60);
    } else {
      t.x += t.dir * 16 * dt;
      t.y += Math.sin(w.t * 0.5) * 3 * dt;
      if (t.x < -80 || t.x > W + 80) Object.assign(t, { on: false, next: rnd(60, 150) });
    }
    const c = this.crab;
    c.timer -= dt;
    if (c.timer < 0) Object.assign(c, { dir: Math.random() < 0.5 ? -1 : 1, timer: rnd(4, 12) });
    if (c.timer > 2) c.x = clamp(c.x + c.dir * 8 * dt, 20, W - 20);
  }

  draw() {
    const w = this.w, c = w.ctx, { W, H } = w, L = w.lightNow;
    // the water: bright under the surface, darkening with depth
    sky(w, [[150, 206, 204], [10, 40, 52]], [[24, 74, 80], [2, 10, 16]], H);
    // the underside of the surface, shimmering
    c.strokeStyle = `rgba(230,250,250,${0.25 + 0.2 * L})`;
    c.lineWidth = 2;
    c.beginPath();
    for (let x = -20; x <= W + 20; x += 12) {
      const y = H * 0.035 + Math.sin(x * 0.02 + w.t * 1.2) * 3 + Math.sin(x * 0.007 - w.t * 0.7) * 4;
      if (x === -20) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    w.drawRays(W * 0.618, -60, L < 0.3 ? [170, 200, 230] : [240, 255, 230], 0.08 + 0.06 * L, 0.9);
    // caustics: light netted across the upper water
    c.strokeStyle = `rgba(240,255,250,${0.05 + 0.05 * L})`;
    c.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) {
      c.beginPath();
      for (let x = -20; x <= W + 20; x += 16) {
        const y = H * (0.08 + i * 0.045) + Math.sin(x * 0.015 + w.t * (0.6 + i * 0.05) + i * 1.7) * 9 + Math.sin(x * 0.04 - w.t * 0.9 + i) * 3;
        if (x === -20) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    // the bed: sand, stones
    const bed = this.bed();
    const sg = c.createLinearGradient(0, bed - 20, 0, H);
    sg.addColorStop(0, rgba(mix([30, 40, 38], [176, 164, 120], L), 0.95));
    sg.addColorStop(1, rgba(mix([10, 14, 14], [110, 100, 76], L)));
    c.fillStyle = sg;
    c.beginPath();
    c.moveTo(-20, H + 10);
    for (let x = -20; x <= W + 20; x += 20) c.lineTo(x, bed + Math.sin(x * 0.006) * 8 + noise(x * 0.01) * 10);
    c.lineTo(W + 20, H + 10);
    c.fill();
    for (const s of this.stones) {
      c.fillStyle = rgba(mix(mix(s.c, [20, 24, 26], 0.75), s.c, L), 0.95);
      c.beginPath();
      c.ellipse(s.x, bed + 10, s.r, s.r * 0.55, 0, Math.PI, TAU);
      c.fill();
    }
    // weed that leans with the slow current
    c.lineCap = "round";
    for (const wd of this.weeds) {
      for (let k = 0; k < wd.n; k++) {
        c.strokeStyle = rgba(mix(mix(wd.col, [10, 24, 20], 0.7), wd.col, L), 0.85);
        c.lineWidth = 3 - k * 0.6;
        c.beginPath();
        let x = wd.x + k * 6, y = bed + 8;
        c.moveTo(x, y);
        for (let s = 1; s <= 10; s++) {
          const u = s / 10;
          x = wd.x + k * 6 + Math.sin(w.t * 0.5 + wd.p + u * 3 + k) * 14 * u + (noise(w.t * 0.1 + wd.p) - 0.5) * 30 * u;
          y = bed + 8 - wd.h * u * (1 - k * 0.12);
          c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    c.lineCap = "butt";
    // creatures
    for (const f of this.big) this.fish(f.x, f.y, f.dir, f.s, f.ph, [200, 140, 70]);
    for (const s of this.schools) {
      const dir = s.vx >= 0 ? 1 : -1;
      for (const f of s.fish) this.fish(s.x + f.ox + Math.sin(w.t * 1.3 + f.ph) * 4, s.y + f.oy + Math.cos(w.t + f.ph) * 3, dir, f.s, f.ph, s.col);
    }
    const t = this.turtle;
    if (t.on) {
      c.fillStyle = ink(w, [70, 96, 70], [18, 30, 26]);
      c.beginPath();
      c.ellipse(t.x, t.y, 22, 13, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.arc(t.x + t.dir * 24, t.y - 2, 6, 0, TAU);
      c.fill();
      const fl = Math.sin(w.t * 2.4) * 8;
      c.beginPath();
      c.ellipse(t.x + t.dir * 10, t.y + 10, 9, 3.5, t.dir * (0.6 + fl * 0.04), 0, TAU);
      c.ellipse(t.x - t.dir * 12, t.y + 9, 6, 3, -t.dir * (0.5 - fl * 0.04), 0, TAU);
      c.fill();
    }
    const cr = this.crab, cy = bed + 4;
    c.fillStyle = ink(w, [170, 90, 60], [40, 24, 20]);
    c.beginPath();
    c.ellipse(cr.x, cy, 9, 5.5, 0, Math.PI, TAU);
    c.fill();
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 1.4;
    for (const sd of [-1, 1]) {
      c.beginPath();
      c.moveTo(cr.x + sd * 6, cy - 2);
      c.lineTo(cr.x + sd * 12, cy - 7 + Math.sin(w.t * 3) * 1.5);
      c.stroke();
    }
    // bubbles rising to the light
    for (const b of this.bubbles) {
      c.strokeStyle = `rgba(235,250,255,${0.55})`;
      c.lineWidth = 0.9;
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, TAU);
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillRect(b.x - b.r * 0.4, b.y - b.r * 0.5, 1, 1);
    }
  }

  private fish(x: number, y: number, dir: number, s: number, ph: number, col: RGB) {
    const c = this.w.ctx, tail = Math.sin(this.w.t * 6 + ph) * 3 * s;
    c.fillStyle = rgba(mix(mix(col, [20, 30, 34], 0.7), col, this.w.lightNow), 0.92);
    c.save();
    c.translate(x, y);
    c.scale(dir * s, s);
    c.beginPath();
    c.ellipse(0, 0, 9, 3.6, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(-7, 0);
    c.lineTo(-13, -4 + tail * 0.3);
    c.lineTo(-13, 4 + tail * 0.3);
    c.fill();
    c.restore();
  }
}

// ═══════════════════════════ The wetland ═══════════════════════════
export class Wetland implements Living {
  private reeds: { x: number; h: number; p: number; cat: boolean }[] = [];
  private pads: { x: number; y: number; r: number; flower: boolean; p: number }[] = [];
  private ducks: { x: number; y: number; dir: number }[] = [];
  private heron = { x: 0, stab: 0, timer: rnd(6, 14), away: 0 };
  private frogs: { pad: number; jump: number; timer: number }[] = [];
  private king = { k: 2, x: 0, y: 0, tx: 0, timer: rnd(40, 90) };
  constructor(private w: World) {}

  horizon() {
    return this.w.H * 0.6;
  }

  layout() {
    const { W, H, mobile } = this.w, r = seeded(41);
    this.reeds = Array.from({ length: mobile ? 26 : 60 }, (_, i) => {
      const side = i % 3 === 0 ? r() * W : i % 2 ? r() * W * 0.25 : W - r() * W * 0.25;
      return { x: side, h: H * (0.14 + r() * 0.22), p: r() * TAU, cat: r() < 0.35 };
    });
    this.pads = Array.from({ length: mobile ? 8 : 16 }, (_, i) => ({ x: ((i + r()) / (mobile ? 8 : 16)) * W, y: H * (0.7 + r() * 0.22), r: 14 + r() * 16, flower: r() < 0.4, p: r() * TAU }));
    this.ducks = [{ x: W * 0.3, y: H * 0.72, dir: 1 }, { x: W * 0.36, y: H * 0.735, dir: 1 }];
    this.heron.x = W * 0.72;
    this.frogs = [{ pad: 2, jump: 0, timer: rnd(8, 20) }, { pad: 7 % this.pads.length, jump: 0, timer: rnd(10, 30) }];
  }

  step(dt: number) {
    const w = this.w, { W } = w;
    for (const d of this.ducks) {
      d.x += d.dir * 9 * dt;
      if (d.x > W + 60) d.x = -60;
    }
    const h = this.heron;
    h.timer -= dt;
    if (h.timer < 0) {
      h.stab = 1;
      h.timer = rnd(8, 22);
      w.ripple(h.x + 34, this.horizon() + w.H * 0.18, true, 50);
    }
    h.stab = Math.max(0, h.stab - dt * 1.4);
    for (const f of this.frogs) {
      f.timer -= dt;
      if (f.timer < 0 && this.pads.length) {
        const from = this.pads[f.pad];
        f.pad = (f.pad + 1 + Math.floor(Math.random() * 3)) % this.pads.length;
        f.jump = 1;
        f.timer = rnd(12, 40);
        const to = this.pads[f.pad];
        w.ripple(from.x, from.y, true, 30);
        window.setTimeout(() => w.ripple(to.x, to.y, true, 36), 500);
      }
      f.jump = Math.max(0, f.jump - dt * 2);
    }
    const k = this.king;
    k.timer -= dt;
    if (k.timer < 0 && k.k >= 2) Object.assign(k, { k: 0, x: -30, y: w.H * 0.3, tx: rnd(W * 0.3, W * 0.7), timer: rnd(50, 120) });
    if (k.k < 2) {
      k.k += dt / 1.6;
      if (k.k >= 1 && k.k - dt / 1.6 < 1) w.ripple(k.tx, this.horizon() + w.H * 0.15, true, 60);
    }
  }

  draw() {
    const w = this.w, c = w.ctx, { W, H } = w, L = w.lightNow, hz = this.horizon();
    sky(w, [[200, 220, 228], [10, 16, 32]], [[244, 226, 196], [40, 40, 60]], hz);
    w.drawStars(1 - L * 1.7);
    const sun: RGB = L < 0.3 ? [228, 232, 244] : [255, 236, 200];
    const sx = W * 0.3, sy = hz - H * 0.16;
    const halo = c.createRadialGradient(sx, sy, 0, sx, sy, 160);
    halo.addColorStop(0, rgba(sun, 0.7));
    halo.addColorStop(1, rgba(sun, 0));
    c.fillStyle = halo;
    c.fillRect(sx - 160, sy - 160, 320, 320);
    // the far treeline
    c.fillStyle = ink(w, [96, 120, 104], [16, 22, 26], 0.9);
    c.beginPath();
    c.moveTo(-20, hz + 2);
    for (let x = -20; x <= W + 20; x += 14) c.lineTo(x, hz - 14 - noise(x * 0.02) * 26 - noise(x * 0.07) * 8);
    c.lineTo(W + 20, hz + 2);
    c.fill();
    // still water holding the sky
    const wg = c.createLinearGradient(0, hz, 0, H);
    wg.addColorStop(0, rgba(mix([30, 34, 50], [214, 214, 206], L)));
    wg.addColorStop(1, rgba(mix([6, 10, 16], [96, 120, 120], L)));
    c.fillStyle = wg;
    c.fillRect(-20, hz, W + 40, H - hz + 20);
    c.strokeStyle = rgba(sun, 0.3);
    for (let i = 0; i < 9; i++) {
      const y = hz + 6 + i * i * 4;
      const half = 20 + i * 10 * (0.5 + noise(w.t * 0.5 + i));
      c.beginPath();
      c.moveTo(sx - half, y);
      c.lineTo(sx + half, y);
      c.stroke();
    }
    // lily pads and lotus
    for (const p of this.pads) {
      c.fillStyle = ink(w, [70, 120, 70], [14, 26, 20], 0.95);
      c.beginPath();
      c.ellipse(p.x, p.y + Math.sin(w.t * 0.4 + p.p) * 1, p.r, p.r * 0.36, 0, 0.3, TAU - 0.05);
      c.lineTo(p.x, p.y);
      c.fill();
      if (p.flower) {
        c.fillStyle = rgba(mix([60, 40, 50], [236, 150, 176], L), 0.95);
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.42;
          c.beginPath();
          c.ellipse(p.x + Math.cos(a) * 5, p.y - 6 + Math.sin(a) * 4, 3.2, 7, a + Math.PI / 2, 0, TAU);
          c.fill();
        }
      }
    }
    for (const f of this.frogs) {
      const p = this.pads[f.pad];
      if (!p) continue;
      c.fillStyle = ink(w, [60, 110, 50], [16, 26, 16]);
      c.beginPath();
      c.ellipse(p.x + 3, p.y - 3 - Math.sin(f.jump * Math.PI) * 30, 5, 3.4, 0, 0, TAU);
      c.fill();
    }
    // ducks with their wakes
    for (const d of this.ducks) {
      c.strokeStyle = `rgba(255,255,255,${0.25 * (0.4 + L)})`;
      c.beginPath();
      c.moveTo(d.x - 6, d.y + 3);
      c.lineTo(d.x - 40, d.y - 4);
      c.moveTo(d.x - 6, d.y + 3);
      c.lineTo(d.x - 40, d.y + 10);
      c.stroke();
      c.fillStyle = ink(w, [110, 90, 60], [20, 18, 16]);
      c.beginPath();
      c.ellipse(d.x, d.y, 11, 5, 0, Math.PI, TAU);
      c.fill();
      c.beginPath();
      c.arc(d.x + 8, d.y - 7, 3.6, 0, TAU);
      c.fill();
      c.fillStyle = rgba(mix([60, 50, 20], [230, 170, 60], L));
      c.fillRect(d.x + 11, d.y - 8, 4, 1.6);
    }
    // the heron, standing in the shallows
    const h = this.heron, hy = hz + H * 0.18;
    c.strokeStyle = ink(w, [60, 70, 80], [14, 16, 20]);
    c.fillStyle = c.strokeStyle;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(h.x, hy);
    c.lineTo(h.x + 2, hy - 34);
    c.moveTo(h.x + 8, hy);
    c.lineTo(h.x + 6, hy - 34);
    c.stroke();
    c.beginPath();
    c.ellipse(h.x + 4, hy - 46, 15, 10, -0.3, 0, TAU);
    c.fill();
    const reach = easeInOut(h.stab) * 22;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(h.x + 14, hy - 52);
    c.quadraticCurveTo(h.x + 24 + reach * 0.5, hy - 78 + reach, h.x + 22 + reach, hy - 82 + reach * 2.2);
    c.stroke();
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(h.x + 22 + reach, hy - 82 + reach * 2.2);
    c.lineTo(h.x + 36 + reach, hy - 79 + reach * 2.6);
    c.stroke();
    // reeds and cattails, each to its own wind
    c.lineCap = "round";
    for (const r of this.reeds) {
      const bend = (noise(w.t * 0.3 + r.p) - 0.5) * (10 + 30 * w.windNow);
      const base = H + 4;
      c.strokeStyle = ink(w, [92, 110, 60], [16, 22, 14]);
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(r.x, base);
      c.quadraticCurveTo(r.x + bend * 0.3, base - r.h * 0.6, r.x + bend, base - r.h);
      c.stroke();
      if (r.cat) {
        c.lineWidth = 5;
        c.strokeStyle = ink(w, [110, 74, 44], [22, 16, 12]);
        c.beginPath();
        c.moveTo(r.x + bend * 0.92, base - r.h * 0.86);
        c.lineTo(r.x + bend * 0.98, base - r.h * 0.96);
        c.stroke();
      }
    }
    c.lineCap = "butt";
    // the kingfisher's dart
    const k = this.king;
    if (k.k < 1) {
      const e = easeInOut(k.k), x = lerp(k.x, k.tx, e), y = lerp(k.y, hz + H * 0.15, e * e);
      c.fillStyle = rgba(mix([30, 60, 90], [40, 140, 200], L));
      c.beginPath();
      c.ellipse(x, y, 7, 3.5, 0.6 * e, 0, TAU);
      c.fill();
    }
  }
}

// ═══════════════════════════ The desert ═══════════════════════════
export class Desert implements Living {
  private grains: { x: number; y: number; v: number }[] = [];
  private caravan = { on: false, x: 0, next: rnd(30, 70) };
  private fox = { on: false, x: 0, peek: 0, timer: rnd(20, 50) };
  private weed = { on: false, x: 0, rot: 0, next: rnd(15, 40) };
  constructor(private w: World) {}

  private dune(i: number, x: number) {
    const H = this.w.H, base = H * (0.6 + i * 0.1);
    return base - (Math.sin(x * (0.004 + i * 0.001) + i * 1.7) * 0.5 + 0.5) * H * (0.08 - i * 0.012) - noise(x * 0.01 + i * 7) * 18;
  }

  layout() {
    const { W, H } = this.w;
    this.grains = Array.from({ length: this.w.mobile ? 40 : 90 }, () => ({ x: Math.random() * W, y: H * rnd(0.55, 1), v: rnd(20, 60) }));
  }

  touch(x: number, y: number) {
    for (let i = 0; i < 18; i++) this.grains.push({ x: x + rnd(-20, 20), y: y + rnd(-10, 10), v: rnd(40, 120) });
    return false;
  }

  step(dt: number) {
    const w = this.w, { W } = w;
    for (const g of this.grains) {
      g.x += (g.v * (0.3 + w.windNow * 1.6)) * dt;
      g.y += Math.sin(w.t * 3 + g.x * 0.05) * 6 * dt;
      if (g.x > W + 10) g.x = -10;
    }
    if (this.grains.length > 140) this.grains.splice(0, this.grains.length - 140);
    const cv = this.caravan;
    if (!cv.on) {
      cv.next -= dt;
      if (cv.next < 0) Object.assign(cv, { on: true, x: W + 60 });
    } else {
      cv.x -= 9 * dt;
      if (cv.x < -260) Object.assign(cv, { on: false, next: rnd(120, 260) });
    }
    const f = this.fox;
    f.timer -= dt;
    if (!f.on && f.timer < 0) Object.assign(f, { on: true, x: rnd(W * 0.15, W * 0.85), peek: 0, timer: rnd(6, 12) });
    if (f.on) {
      f.peek = clamp(f.peek + dt * (f.timer > 2 ? 0.8 : -0.8));
      if (f.timer < 0) Object.assign(f, { on: false, timer: rnd(40, 90) });
    }
    const tw = this.weed;
    if (!tw.on) {
      tw.next -= dt * (0.5 + w.windNow * 2);
      if (tw.next < 0) Object.assign(tw, { on: true, x: -30 });
    } else {
      tw.x += (30 + w.windNow * 90) * dt;
      tw.rot += (2 + w.windNow * 5) * dt;
      if (tw.x > W + 40) Object.assign(tw, { on: false, next: rnd(30, 80) });
    }
  }

  draw() {
    const w = this.w, c = w.ctx, { W, H } = w, L = w.lightNow;
    sky(w, [[150, 196, 226], [8, 10, 34]], [[246, 220, 180], [44, 34, 60]], H * 0.7);
    w.drawStars(1 - L * 1.5);
    const sun: RGB = L < 0.3 ? [236, 236, 246] : [255, 226, 160];
    const sx = W * 0.72, sy = H * (0.5 - 0.22 * L);
    const halo = c.createRadialGradient(sx, sy, 0, sx, sy, 300);
    halo.addColorStop(0, rgba(sun, 0.75));
    halo.addColorStop(0.1, rgba(sun, 0.3));
    halo.addColorStop(1, rgba(sun, 0));
    c.fillStyle = halo;
    c.fillRect(sx - 300, sy - 300, 600, 600);
    c.fillStyle = rgba(sun, 0.95);
    c.beginPath();
    c.arc(sx, sy, L < 0.3 ? 16 : 26, 0, TAU);
    c.fill();
    w.drawRays(sx, sy, sun, 0.04 + 0.03 * L, 1.8);
    // dunes, far to near, lit on one side
    for (let i = 0; i < 4; i++) {
      const lit = mix(mix([40, 30, 40], [236, 196, 140], L), [214, 160, 110], i * 0.18);
      const g = c.createLinearGradient(0, H * (0.5 + i * 0.1), 0, H);
      g.addColorStop(0, rgba(lit, 0.98));
      g.addColorStop(1, rgba(mix(lit, [60, 36, 26], 0.45), 0.98));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(-20, H + 10);
      for (let x = -20; x <= W + 20; x += 16) c.lineTo(x, this.dune(i, x));
      c.lineTo(W + 20, H + 10);
      c.fill();
      c.strokeStyle = `rgba(255,246,226,${0.25 * L})`;
      c.lineWidth = 1;
      c.beginPath();
      for (let x = -20; x <= W + 20; x += 16) (x === -20 ? c.moveTo : c.lineTo).call(c, x, this.dune(i, x));
      c.stroke();
      if (i === 0 && this.caravan.on) this.drawCaravan();
    }
    // a cactus and an acacia, still
    const cx = W * 0.14, cy = this.dune(3, W * 0.14);
    c.fillStyle = ink(w, [70, 100, 60], [16, 18, 16]);
    c.beginPath();
    c.roundRect(cx - 5, cy - 70, 10, 72, 5);
    c.roundRect(cx - 22, cy - 46, 8, 26, 4);
    c.roundRect(cx + 14, cy - 56, 8, 30, 4);
    c.roundRect(cx - 22, cy - 26, 20, 7, 3);
    c.roundRect(cx + 2, cy - 32, 20, 7, 3);
    c.fill();
    const ax = W * 0.9, ay = this.dune(2, W * 0.9);
    c.strokeStyle = ink(w, [80, 60, 40], [16, 14, 12]);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(ax - 4, ay - 40);
    c.lineTo(ax - 20, ay - 56);
    c.moveTo(ax - 4, ay - 40);
    c.lineTo(ax + 16, ay - 58);
    c.stroke();
    c.fillStyle = ink(w, [90, 110, 60], [16, 18, 14]);
    c.beginPath();
    c.ellipse(ax - 2, ay - 60, 34, 8, 0, 0, TAU);
    c.fill();
    // the fennec, peeking over a dune
    const f = this.fox;
    if (f.on) {
      const fy = this.dune(3, f.x) + 6 - f.peek * 14;
      c.fillStyle = ink(w, [200, 150, 100], [30, 24, 20]);
      c.beginPath();
      c.ellipse(f.x, fy, 7, 6, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(f.x - 6, fy - 2);
      c.lineTo(f.x - 9, fy - 16);
      c.lineTo(f.x - 1, fy - 5);
      c.moveTo(f.x + 6, fy - 2);
      c.lineTo(f.x + 9, fy - 16);
      c.lineTo(f.x + 1, fy - 5);
      c.fill();
    }
    // sand on the wind
    c.fillStyle = rgba(mix([120, 100, 90], [255, 236, 200], L), 0.55);
    for (const g of this.grains) c.fillRect(g.x, g.y, 1.4, 1);
    const tw = this.weed;
    if (tw.on) {
      const ty = this.dune(3, tw.x) - 12 - Math.abs(Math.sin(tw.rot * 1.5)) * 10;
      c.strokeStyle = ink(w, [140, 110, 70], [30, 24, 18], 0.8);
      c.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        c.beginPath();
        c.ellipse(tw.x, ty, 12, 9, tw.rot + i * 0.45, 0, TAU);
        c.stroke();
      }
    }
  }

  private drawCaravan() {
    const w = this.w, c = w.ctx;
    c.fillStyle = ink(w, [110, 80, 60], [18, 16, 20], 0.85);
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const x = this.caravan.x + i * 70, y = this.dune(0, x), step = Math.sin(w.t * 2.6 + i) * 3;
      c.beginPath();
      c.ellipse(x, y - 26, 16, 8, 0, 0, TAU);
      c.ellipse(x - 2, y - 33, 7, 6, 0, 0, TAU); // the hump
      c.fill();
      c.beginPath();
      c.moveTo(x - 14, y - 26);
      c.lineTo(x - 22, y - 40);
      c.stroke();
      c.beginPath();
      c.ellipse(x - 24, y - 41, 5, 3, 0, 0, TAU);
      c.fill();
      for (const lx of [-10, -4, 6, 12]) {
        c.beginPath();
        c.moveTo(x + lx, y - 20);
        c.lineTo(x + lx + (lx < 0 ? step : -step), y);
        c.stroke();
      }
    }
  }
}

// ═══════════════════════════ The polar ice ═══════════════════════════
export class Polar implements Living {
  private snow: { x: number; y: number; v: number; p: number; s: number }[] = [];
  private floes: { x: number; y: number; w: number }[] = [];
  private bear = { x: 0, dir: 1, walk: 0, sit: 0, timer: rnd(10, 20) };
  private penguins: { x: number; ph: number; slide: number }[] = [];
  private orca = { k: 1, x: 0, timer: rnd(10, 30), dir: 1 };
  private seal = { lift: 0, timer: rnd(6, 14) };
  constructor(private w: World) {}

  sea() {
    return this.w.H * 0.64;
  }
  shelf() {
    return this.w.H * 0.84;
  }

  layout() {
    const { W, H, mobile } = this.w;
    this.snow = Array.from({ length: mobile ? 60 : 130 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: rnd(10, 26), p: Math.random() * TAU, s: rnd(0.8, 2.2) }));
    this.floes = [{ x: W * 0.18, y: H * 0.7, w: 120 }, { x: W * 0.52, y: H * 0.74, w: 90 }, { x: W * 0.82, y: H * 0.69, w: 150 }];
    this.bear.x = W * 0.3;
    this.penguins = Array.from({ length: mobile ? 4 : 6 }, (_, i) => ({ x: W * 0.62 + i * 16, ph: i * 1.3, slide: 0 }));
  }

  touch(x: number, y: number) {
    if (y > this.sea() && y < this.shelf()) {
      this.w.ripple(x, y, true, 70);
      return true;
    }
    return false;
  }

  step(dt: number) {
    const w = this.w, { W, H } = w;
    for (const s of this.snow) {
      s.y += s.v * dt;
      s.x += (Math.sin(w.t * 0.6 + s.p) * 8 + w.windNow * 30) * dt;
      if (s.y > H + 4) (s.y = -4), (s.x = Math.random() * W);
      if (s.x > W + 4) s.x = -4;
    }
    for (const f of this.floes) f.x += Math.sin(w.t * 0.05 + f.w) * 2 * dt;
    const b = this.bear;
    b.timer -= dt;
    if (b.timer < 0) Object.assign(b, b.sit ? { sit: 0, timer: rnd(10, 20), dir: Math.random() < 0.5 ? 1 : -1 } : { sit: 1, timer: rnd(6, 14) });
    if (!b.sit) {
      b.x = clamp(b.x + b.dir * 10 * dt, 60, W * 0.5);
      b.walk += dt * 3.2;
      if (b.x <= 60 || b.x >= W * 0.5) b.dir *= -1;
    }
    for (const p of this.penguins) {
      p.ph += dt * 6;
      if (p.slide > 0) (p.slide -= dt), (p.x += 40 * dt);
      else if (Math.random() < dt * 0.02) p.slide = 1.4;
      else p.x += Math.sin(w.t * 0.2 + p.ph * 0.02) * 3 * dt;
      if (p.x > W - 30) p.x = W * 0.6;
    }
    const o = this.orca;
    o.timer -= dt;
    if (o.k >= 1 && o.timer < 0) Object.assign(o, { k: 0, x: rnd(W * 0.2, W * 0.8), dir: Math.random() < 0.5 ? 1 : -1, timer: rnd(25, 70) });
    if (o.k < 1) {
      o.k += dt / 6;
      if (o.k > 0.45 && o.k - dt / 6 <= 0.45) w.ripple(o.x + o.dir * 30, this.sea() + 30, true, 90);
    }
    const s = this.seal;
    s.timer -= dt;
    if (s.timer < 0) (s.lift = 1), (s.timer = rnd(8, 20));
    s.lift = Math.max(0, s.lift - dt * 0.3);
  }

  draw() {
    const w = this.w, c = w.ctx, { W, H } = w, L = w.lightNow, sea = this.sea();
    sky(w, [[180, 210, 230], [4, 10, 24]], [[236, 242, 246], [16, 30, 48]], sea);
    w.drawStars(1 - L * 1.4);
    // the aurora: curtains of light that drift (strongest at night, faint by day)
    const aur = clamp(1.1 - L * 1.1, 0.06, 1);
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      for (let x = -20; x <= W + 20; x += 18) {
        const y = H * (0.12 + k * 0.06) + Math.sin(x * 0.004 + w.t * 0.08 + k) * 30 + (noise(x * 0.006 + w.t * 0.05 + k * 4) - 0.5) * 50;
        if (x === -20) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      const g = c.createLinearGradient(0, H * 0.05, 0, H * 0.5);
      const col: RGB = k === 1 ? [170, 120, 240] : [110, 240, 180];
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(0.4, rgba(col, 0.28 * aur));
      g.addColorStop(1, rgba(col, 0));
      c.strokeStyle = g;
      c.lineWidth = 60 + k * 20;
      c.stroke();
    }
    // far glaciers
    c.fillStyle = rgba(mix([40, 54, 74], [226, 236, 244], L));
    c.beginPath();
    c.moveTo(-20, sea + 2);
    for (let x = -20; x <= W + 20; x += 30) c.lineTo(x, sea - 30 - Math.abs(Math.sin(x * 0.01)) * 50 * noise(x * 0.004));
    c.lineTo(W + 20, sea + 2);
    c.fill();
    // the sea
    const sg = c.createLinearGradient(0, sea, 0, this.shelf());
    sg.addColorStop(0, rgba(mix([10, 22, 36], [96, 136, 160], L)));
    sg.addColorStop(1, rgba(mix([2, 8, 16], [40, 72, 98], L)));
    c.fillStyle = sg;
    c.fillRect(-20, sea, W + 40, H - sea + 20);
    c.strokeStyle = `rgba(230,244,255,${0.12 + 0.1 * L})`;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      for (let x = -20; x <= W + 20; x += 20) {
        const y = sea + 10 + i * 16 + Math.sin(x * 0.02 + w.t * 0.5 + i) * 2;
        if (x === -20) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    // the orca's back and fin, rising and going under
    const o = this.orca;
    if (o.k < 1) {
      const rise = Math.sin(o.k * Math.PI), ox = o.x + o.dir * o.k * 120, oy = sea + 34 - rise * 16;
      c.save();
      c.beginPath();
      c.rect(-20, -20, W + 40, sea + 34);
      c.clip();
      c.fillStyle = "rgba(14,16,20,0.95)";
      c.beginPath();
      c.ellipse(ox, oy + 10, 44, 14, 0, Math.PI, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(ox - o.dir * 6, oy - 2);
      c.lineTo(ox + o.dir * 2, oy - 30 * rise);
      c.lineTo(ox + o.dir * 12, oy - 2);
      c.fill();
      c.restore();
      if (o.k > 0.35 && o.k < 0.5) {
        c.fillStyle = "rgba(240,248,255,0.35)";
        c.beginPath();
        c.ellipse(ox + o.dir * 24, oy - 24, 5, 14, 0, 0, TAU);
        c.fill();
      }
    }
    // ice floes, a seal on one and a walrus on another
    this.floes.forEach((f, i) => {
      c.fillStyle = rgba(mix([60, 76, 96], [244, 250, 255], L));
      c.beginPath();
      c.ellipse(f.x, f.y, f.w / 2, 9, 0, 0, TAU);
      c.fill();
      c.fillStyle = rgba(mix([30, 44, 60], [170, 200, 222], L));
      c.fillRect(f.x - f.w / 2, f.y, f.w, 5);
      if (i === 0) {
        const s = this.seal;
        c.fillStyle = ink(w, [96, 96, 100], [24, 26, 30]);
        c.beginPath();
        c.ellipse(f.x, f.y - 7, 24, 7, 0, 0, TAU);
        c.fill();
        c.beginPath();
        c.arc(f.x + 22, f.y - 10 - s.lift * 8, 6, 0, TAU);
        c.fill();
      }
      if (i === 2) {
        c.fillStyle = ink(w, [130, 96, 80], [30, 24, 22]);
        c.beginPath();
        c.ellipse(f.x - 6, f.y - 12, 32, 14, 0, Math.PI, TAU);
        c.fill();
        c.beginPath();
        c.arc(f.x + 26, f.y - 14 + Math.sin(w.t * 0.5) * 1.5, 10, 0, TAU);
        c.fill();
        c.strokeStyle = "rgba(250,246,236,0.95)";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(f.x + 28, f.y - 8);
        c.lineTo(f.x + 30, f.y + 4);
        c.moveTo(f.x + 33, f.y - 9);
        c.lineTo(f.x + 35, f.y + 3);
        c.stroke();
      }
    });
    // the ice shelf in front
    const sh = this.shelf();
    const ig = c.createLinearGradient(0, sh - 10, 0, H);
    ig.addColorStop(0, rgba(mix([70, 86, 106], [248, 252, 255], L)));
    ig.addColorStop(1, rgba(mix([30, 40, 56], [196, 218, 236], L)));
    c.fillStyle = ig;
    c.beginPath();
    c.moveTo(-20, H + 10);
    for (let x = -20; x <= W + 20; x += 24) c.lineTo(x, sh + noise(x * 0.01) * 14 - 6);
    c.lineTo(W + 20, H + 10);
    c.fill();
    // the polar bear
    const b = this.bear, by = sh + 4;
    c.save();
    c.translate(b.x, by);
    c.scale(b.dir, 1);
    c.fillStyle = rgba(mix([150, 150, 150], [252, 248, 236], L));
    c.strokeStyle = rgba(mix([60, 60, 66], [200, 196, 186], L));
    c.lineWidth = 1.2;
    if (!b.sit) {
      for (const [lx, ph] of [[-22, 0], [-12, 2.4], [14, 1.2], [24, 3.4]] as [number, number][]) {
        const sw = Math.sin(b.walk + ph) * 5;
        c.beginPath();
        c.roundRect(lx + sw - 4, -24, 9, 24, 3);
        c.fill();
        c.stroke();
      }
      c.beginPath();
      c.ellipse(0, -32, 34, 17, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.beginPath();
      c.ellipse(38, -36, 14, 9, 0.2, 0, TAU);
      c.fill();
      c.stroke();
    } else {
      c.beginPath();
      c.ellipse(0, -26, 22, 26, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.beginPath();
      c.ellipse(10, -58, 11, 9, 0.2, 0, TAU);
      c.fill();
      c.stroke();
    }
    c.restore();
    // penguins, waddling; now and then one slides on its belly
    for (const p of this.penguins) {
      const py = sh + 2 + noise(p.x * 0.01) * 8;
      c.save();
      c.translate(p.x, py);
      if (p.slide > 0) c.rotate(Math.PI / 2.2);
      else c.rotate(Math.sin(p.ph) * 0.12);
      c.fillStyle = "rgba(20,22,30,0.96)";
      c.beginPath();
      c.ellipse(0, -12, 6, 12, 0, 0, TAU);
      c.fill();
      c.fillStyle = "rgba(246,246,240,0.96)";
      c.beginPath();
      c.ellipse(1.5, -10, 3.6, 8.5, 0, 0, TAU);
      c.fill();
      c.fillStyle = "rgba(20,22,30,0.96)";
      c.beginPath();
      c.arc(0, -24, 4.4, 0, TAU);
      c.fill();
      c.fillStyle = "rgba(240,170,60,0.95)";
      c.fillRect(3, -24, 4, 1.6);
      c.restore();
    }
    // snow
    c.fillStyle = "rgba(255,255,255,0.85)";
    for (const s of this.snow) {
      c.beginPath();
      c.arc(s.x, s.y, s.s, 0, TAU);
      c.fill();
    }
  }
}

// ═══════════════════════════ The Amazon ═══════════════════════════
export class Amazon implements Living {
  private plants: { x: number; h: number; kind: number; p: number; d: number }[] = [];
  private macaws: { x: number; y: number; vx: number; flap: number; col: RGB }[] = [];
  private nextMacaw = rnd(3, 8);
  private jaguar = { on: false, x: 0, dir: 1, walk: 0, next: rnd(60, 140) };
  private dolphin = { k: 1, x: 0, timer: rnd(15, 40), dir: 1 };
  private rain = { on: 0, drops: [] as { x: number; y: number }[], next: rnd(60, 180) };
  constructor(private w: World) {}

  river() {
    return this.w.H * 0.82;
  }

  layout() {
    const { W, H, mobile } = this.w, r = seeded(53);
    this.plants = Array.from({ length: mobile ? 16 : 34 }, (_, i) => ({ x: (i / (mobile ? 16 : 34)) * W + r() * 40, h: H * (0.3 + r() * 0.4), kind: Math.floor(r() * 3), p: r() * TAU, d: r() }));
    this.plants.sort((a, b) => a.d - b.d);
  }

  step(dt: number) {
    const w = this.w, { W, H } = w;
    this.nextMacaw -= dt * (1 + Math.min(1, w.idleNow / 40));
    if (this.nextMacaw < 0) {
      const dir = Math.random() < 0.5 ? 1 : -1, cols: RGB[] = [[220, 40, 40], [40, 120, 220], [240, 190, 40]];
      for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++)
        this.macaws.push({ x: dir > 0 ? -40 - i * 50 : W + 40 + i * 50, y: rnd(H * 0.1, H * 0.35), vx: dir * rnd(70, 110), flap: Math.random() * TAU, col: cols[Math.floor(Math.random() * 3)] });
      this.nextMacaw = rnd(14, 34);
    }
    for (const m of this.macaws) {
      m.x += m.vx * dt;
      m.flap += dt * 9;
      m.y += Math.sin(m.flap * 0.2) * 8 * dt;
    }
    this.macaws = this.macaws.filter((m) => m.x > -120 && m.x < W + 120);
    const j = this.jaguar;
    if (!j.on) {
      j.next -= dt;
      if (j.next < 0) Object.assign(j, { on: true, dir: Math.random() < 0.5 ? 1 : -1 }), (j.x = j.dir > 0 ? -80 : W + 80);
    } else {
      j.x += j.dir * 16 * dt;
      j.walk += dt * 4;
      if (j.x < -100 || j.x > W + 100) Object.assign(j, { on: false, next: rnd(150, 320) });
    }
    const d = this.dolphin;
    d.timer -= dt;
    if (d.k >= 1 && d.timer < 0) Object.assign(d, { k: 0, x: rnd(W * 0.1, W * 0.9), dir: Math.random() < 0.5 ? 1 : -1, timer: rnd(20, 50) });
    if (d.k < 1) d.k += dt / 2.6;
    const r = this.rain;
    r.next -= dt;
    if (r.next < 0 && !r.on) (r.on = rnd(20, 40)), (r.next = rnd(120, 300));
    if (r.on > 0) {
      r.on -= dt;
      while (r.drops.length < 120) r.drops.push({ x: Math.random() * W, y: Math.random() * -H });
    }
    for (const p of r.drops) p.y += 520 * dt;
    r.drops = r.drops.filter((p) => p.y < H);
    if (r.on <= 0 && !r.drops.length) r.on = 0;
  }

  draw() {
    const w = this.w, c = w.ctx, { W, H } = w, L = w.lightNow, rv = this.river();
    sky(w, [[206, 228, 200], [6, 16, 14]], [[120, 170, 120], [8, 20, 16]], H);
    w.drawRays(W * 0.618, -30, [255, 250, 210], 0.07 * L + 0.02, 0.6, Math.PI / 2 - 0.2);
    // the river, wide and brown-gold, slow
    const rg = c.createLinearGradient(0, rv, 0, H);
    rg.addColorStop(0, rgba(mix([20, 26, 22], [170, 150, 100], L)));
    rg.addColorStop(1, rgba(mix([8, 12, 10], [104, 90, 60], L)));
    c.fillStyle = rg;
    c.fillRect(-20, rv, W + 40, H - rv + 20);
    c.strokeStyle = `rgba(255,250,230,${0.12 + 0.1 * L})`;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      for (let x = -20; x <= W + 20; x += 20) {
        const y = rv + 8 + i * 14 + Math.sin(x * 0.015 - w.t * 0.4 + i) * 2;
        if (x === -20) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    const d = this.dolphin;
    if (d.k < 1) {
      const a = d.k * Math.PI, x = d.x + d.dir * d.k * 90, y = rv + 26 - Math.sin(a) * 26;
      c.save();
      c.beginPath();
      c.rect(-20, -20, W + 40, rv + 24);
      c.clip();
      c.fillStyle = rgba(mix([60, 40, 50], [236, 170, 176], L), 0.95);
      c.beginPath();
      c.ellipse(x, y, 22, 7, d.dir * (a - Math.PI / 2) * 0.6, 0, TAU);
      c.fill();
      c.restore();
    }
    // the forest, far to near: palms, broad leaves, buttress trunks with lianas
    for (const p of this.plants) {
      const col = mix(mix([10, 30, 20], [96, 150, 96], L), mix([4, 14, 8], [28, 74, 40], L), p.d);
      const sway = (noise(w.t * 0.3 + p.p) - 0.5) * (8 + 24 * w.windNow) * (0.5 + p.d);
      const base = rv + 4, top = base - p.h;
      c.strokeStyle = rgba(col, 0.96);
      c.fillStyle = rgba(col, 0.96);
      c.lineWidth = 4 + p.d * 6;
      c.beginPath();
      c.moveTo(p.x, base);
      c.quadraticCurveTo(p.x + sway * 0.4, base - p.h * 0.5, p.x + sway, top);
      c.stroke();
      if (p.kind === 0) {
        // a palm: fronds from the crown
        c.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i - 3) * 0.5 + sway * 0.01;
          c.beginPath();
          c.moveTo(p.x + sway, top);
          c.quadraticCurveTo(p.x + sway + Math.cos(a) * 40, top + Math.sin(a) * 30 - 10, p.x + sway + Math.cos(a) * 70, top + Math.sin(a) * 20 + 26);
          c.stroke();
        }
      } else {
        // broad canopy of big leaves
        for (let i = 0; i < 7; i++) {
          const a = i * GOLDEN_ANGLE, rr = Math.sqrt(i + 1) * 16;
          c.beginPath();
          c.ellipse(p.x + sway + Math.cos(a) * rr * 1.4, top + Math.sin(a) * rr * 0.6, 26 + p.d * 10, 12 + p.d * 5, a, 0, TAU);
          c.fill();
        }
        if (p.kind === 2) {
          c.lineWidth = 1.2;
          c.beginPath(); // a liana
          c.moveTo(p.x + sway + 20, top + 10);
          c.quadraticCurveTo(p.x + 40 + sway, top + p.h * 0.4, p.x + 30, top + p.h * 0.7);
          c.stroke();
        }
      }
    }
    // the jaguar along the bank
    const j = this.jaguar;
    if (j.on) {
      const y = rv + 2;
      c.save();
      c.translate(j.x, y);
      c.scale(j.dir, 1);
      c.fillStyle = rgba(mix([40, 30, 20], [210, 150, 70], L));
      c.strokeStyle = c.fillStyle;
      c.lineWidth = 3.2;
      c.lineCap = "round";
      for (const [lx, ph] of [[-16, 0], [-10, 2.2], [12, 1.1], [18, 3.3]] as [number, number][]) {
        const sw = Math.sin(j.walk + ph) * 5;
        c.beginPath();
        c.moveTo(lx, -16);
        c.lineTo(lx + sw, 0);
        c.stroke();
      }
      c.beginPath();
      c.ellipse(0, -20, 24, 8, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.ellipse(26, -24, 8, 6, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(-22, -20);
      c.quadraticCurveTo(-36, -16, -40, -4 + Math.sin(w.t) * 3);
      c.stroke();
      c.fillStyle = "rgba(30,20,14,0.55)"; // rosettes
      for (let i = 0; i < 6; i++) c.fillRect(-16 + i * 6, -23 + (i % 2) * 4, 2.5, 2.5);
      c.restore();
      c.lineCap = "butt";
    }
    // macaws crossing in colour
    for (const m of this.macaws) {
      const f = Math.sin(m.flap) * 9, dir = Math.sign(m.vx);
      c.fillStyle = rgba(mix(mix(m.col, [20, 20, 20], 0.6), m.col, L));
      c.beginPath();
      c.ellipse(m.x, m.y, 10, 4, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(m.x - dir * 8, m.y);
      c.lineTo(m.x - dir * 26, m.y + 3);
      c.lineTo(m.x - dir * 8, m.y + 2);
      c.fill();
      c.beginPath();
      c.moveTo(m.x - 4, m.y - 2);
      c.lineTo(m.x, m.y - 2 - f * 1.5);
      c.lineTo(m.x + 6, m.y - 2);
      c.fill();
    }
    // a passing rain
    if (this.rain.drops.length) {
      c.strokeStyle = `rgba(230,240,255,${0.25 + 0.1 * L})`;
      c.lineWidth = 1;
      c.beginPath();
      for (const p of this.rain.drops) {
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - 2, p.y + 12);
      }
      c.stroke();
    }
  }
}
