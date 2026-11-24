/**
 * The Living Universe: one canvas behind every page, three worlds and the light that is common to all.
 *
 *   Ocean of Consciousness   procedural water that breathes, dew sliding down the glass, ripples where touched
 *   Rainforest of Life       layered trees in mist, shafts of light, pollen, and creatures that simply exist
 *   Sparrow and Autumn Tree  an old tree in afternoon light, leaves that never stop, a nest built piece by piece
 *
 * Nothing loops: every motion is driven by slow noise and by time, so no two moments repeat. The light follows the
 * visitor's own clock (morning → evening → starlight), the whole scene breathes (~0.3%, six breaths a minute), and
 * the proportions hide the golden ratio (ripple rings, branch angles, the phyllotaxis of the leaves).
 */
import type { Scene } from "./scenes";

const TAU = Math.PI * 2;
const PHI = 1.6180339887;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
type RGB = [number, number, number];

// ─────────────────────────── small tools ───────────────────────────
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** smooth 1-D value noise in [0, 1] */
function noise(x: number) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
}
function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Ripple { x: number; y: number; r: number; max: number; water: boolean; speed: number }
interface Mote { x: number; y: number; s: number; p: number; v: number }

// ─────────────────────────── the world ───────────────────────────
export class World {
  private c: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  private k = 1; // backing-store scale
  scene: Scene;
  private prev: Scene | null = null;
  private morph = 1; // 0 → 1 while one world becomes the next
  t = 0;
  dark = false;
  mobile = false;
  private light = 1; // 0 night … 1 full day
  private warm = 0; // golden hour
  private wind = 0.2;
  private windTarget = 0.2;
  private idle = 0;
  private pointer = { x: -999, y: -999 };
  private ripples: Ripple[] = [];
  private motes: Mote[] = [];
  private stars: { x: number; y: number; s: number; p: number }[] = [];
  private ocean = new Ocean(this);
  private forest = new Forest(this);
  private autumn = new Autumn(this);

  constructor(private cvs: HTMLCanvasElement, scene: Scene) {
    this.c = cvs.getContext("2d")!;
    this.scene = scene;
    this.resize();
    this.clock();
  }

  get ctx() {
    return this.c;
  }
  get breath() {
    return Math.sin((this.t * TAU) / 10); // six breaths a minute
  }
  get windNow() {
    return this.wind;
  }
  get lightNow() {
    return this.light;
  }
  get warmNow() {
    return this.warm;
  }
  get idleNow() {
    return this.idle;
  }
  get pointerNow() {
    return this.pointer;
  }

  resize() {
    const W = innerWidth, H = innerHeight;
    this.mobile = W < 720;
    // soft scenes need no retina detail: draw at CSS size (or a little under on very large screens)
    this.k = W * H > 2_000_000 ? 0.8 : 1;
    this.cvs.width = Math.round(W * this.k);
    this.cvs.height = Math.round(H * this.k);
    this.W = W;
    this.H = H;
    const r = seeded(11);
    this.stars = Array.from({ length: this.mobile ? 70 : 140 }, () => ({ x: r() * W, y: r() * H * 0.8, s: 0.4 + r() * 1.1, p: r() * TAU }));
    this.motes = Array.from({ length: this.mobile ? 18 : 34 }, () => this.newMote(true));
    this.ocean.layout();
    this.forest.layout();
    this.autumn.layout();
  }

  /** the visitor's own time of day: morning gradually becomes evening, evening becomes starlight */
  clock() {
    if (this.dark) {
      this.light = 0.07;
      this.warm = 0;
      return;
    }
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    // by day the pages stay readable: the sky moves between dawn, noon and dusk, never to full night
    this.light = clamp(0.42 + 0.58 * Math.sin((Math.PI * (h - 5)) / 15), 0.42, 1);
    this.warm = clamp(Math.exp(-((h - 7.2) ** 2) / 2.2) + Math.exp(-((h - 17.6) ** 2) / 3), 0, 1);
  }

  setScene(s: Scene) {
    if (s === this.scene) return;
    this.prev = this.scene;
    this.scene = s;
    this.morph = 0;
  }

  // ── what the visitor does touches nature ──
  touch(x: number, y: number) {
    this.idle = 0;
    const water = this.scene === "ocean" && y > this.ocean.surface(x) - 8;
    this.ripple(x, water ? this.ocean.surface(x) + 6 : y, water, water ? 90 : 46);
    if (this.scene === "forest") this.forest.startle(x, y);
    if (this.scene === "autumn") this.autumn.shake(x);
  }
  ripple(x: number, y: number, water: boolean, max: number) {
    if (this.ripples.length > 24) this.ripples.shift();
    this.ripples.push({ x, y, r: 1, max, water, speed: water ? 22 : 30 });
  }
  scroll(dy: number) {
    this.idle = 0;
    this.windTarget = clamp(this.windTarget + Math.min(Math.abs(dy), 120) * 0.004, 0, 1);
  }
  move(x: number, y: number) {
    const dx = x - this.pointer.x, dy = y - this.pointer.y;
    this.pointer = { x, y };
    if (dx * dx + dy * dy > 4) this.idle = 0;
    if (this.scene === "ocean" && y > this.ocean.surface(x) - 6 && Math.random() < 0.08) this.ripple(x, y, true, 30);
  }

  private newMote(anywhere = false): Mote {
    return { x: Math.random() * this.W, y: anywhere ? Math.random() * this.H : this.H + 10, s: rnd(0.6, 1.8), p: Math.random() * TAU, v: rnd(4, 11) };
  }

  // ─────────── one frame ───────────
  step(dt: number) {
    this.t += dt;
    this.idle += dt;
    // wind: a slow breath of its own, now and then a gust, and whatever the scrolling stirred up
    const gust = Math.max(0, noise(this.t * 0.05 + 7) - 0.62) * 2.2;
    this.windTarget = lerp(this.windTarget, 0.16 + gust, dt * 0.25);
    this.wind = lerp(this.wind, this.windTarget, dt * 0.8);
    if (this.morph < 1) this.morph = Math.min(1, this.morph + dt / 2.6);
    for (const r of this.ripples) r.r += r.speed * dt * (1 - (r.r / r.max) * 0.6);
    this.ripples = this.ripples.filter((r) => r.r < r.max);
    const rich = Math.min(1, this.idle / 40); // stillness makes nature richer
    for (const m of this.motes) {
      m.y -= m.v * dt * (0.4 + 0.3 * rich);
      m.x += (noise(this.t * 0.1 + m.p * 10) - 0.5) * 12 * dt + this.wind * 6 * dt;
      if (m.y < -10 || m.x > this.W + 10) Object.assign(m, this.newMote());
    }
    const scenes = [this.scene, ...(this.prev && this.morph < 1 ? [this.prev] : [])];
    if (scenes.includes("ocean")) this.ocean.step(dt);
    if (scenes.includes("forest")) this.forest.step(dt);
    if (scenes.includes("autumn")) this.autumn.step(dt);
  }

  draw() {
    const c = this.c, b = 1 + 0.003 * this.breath; // the whole scene breathes
    c.setTransform(this.k * b, 0, 0, this.k * b, (this.W * this.k * (1 - b)) / 2, (this.H * this.k * (1 - b)) / 2);
    c.globalAlpha = 1;
    this.drawScene(this.scene);
    if (this.prev && this.morph < 1) {
      // the old world dissolves into mist, the mist becomes the new world
      c.globalAlpha = 1 - easeInOut(this.morph);
      this.drawScene(this.prev);
      c.globalAlpha = 1;
      const veil = Math.sin(this.morph * Math.PI);
      const g = c.createLinearGradient(0, 0, 0, this.H);
      const mist: RGB = this.dark ? [40, 48, 70] : [246, 244, 238];
      g.addColorStop(0, rgba(mist, 0.15 * veil));
      g.addColorStop(0.55, rgba(mist, 0.55 * veil));
      g.addColorStop(1, rgba(mist, 0.25 * veil));
      c.fillStyle = g;
      c.fillRect(0, 0, this.W, this.H);
    }
    this.drawRipples();
    this.drawMotes();
  }

  private drawScene(s: Scene) {
    if (s === "ocean") this.ocean.draw();
    else if (s === "forest") this.forest.draw();
    else this.autumn.draw();
  }

  drawStars(alpha: number) {
    if (alpha <= 0.01) return;
    const c = this.c;
    for (const s of this.stars) {
      c.fillStyle = `rgba(235,240,255,${alpha * (0.35 + 0.4 * (0.5 + 0.5 * Math.sin(this.t * 0.6 + s.p)))})`;
      c.fillRect(s.x, s.y, s.s, s.s);
    }
  }

  /** soft volumetric light: a few faint beams from a point, breathing */
  drawRays(x: number, y: number, col: RGB, strength: number, spread = 0.9, toward = Math.PI / 2) {
    const c = this.c, n = 5, len = Math.hypot(this.W, this.H);
    for (let i = 0; i < n; i++) {
      const a = toward + (i / (n - 1) - 0.5) * spread + (noise(this.t * 0.03 + i * 3) - 0.5) * 0.08;
      const w = 0.035 + 0.02 * noise(this.t * 0.05 + i);
      const g = c.createLinearGradient(x, y, x + Math.cos(a) * len * 0.7, y + Math.sin(a) * len * 0.7);
      const al = strength * (0.55 + 0.45 * noise(this.t * 0.07 + i * 5)) * (0.9 + 0.1 * this.breath);
      g.addColorStop(0, rgba(col, al));
      g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a - w) * len, y + Math.sin(a - w) * len);
      c.lineTo(x + Math.cos(a + w) * len, y + Math.sin(a + w) * len);
      c.closePath();
      c.fill();
    }
  }

  private drawRipples() {
    const c = this.c;
    for (const r of this.ripples) {
      const life = 1 - r.r / r.max;
      // rings spaced by the golden ratio, as on still water
      for (let i = 0; i < 3; i++) {
        const rr = r.r / Math.pow(PHI, i);
        if (rr < 1) continue;
        c.strokeStyle = r.water
          ? `rgba(230,245,250,${0.5 * life * (1 - i * 0.28)})`
          : this.dark
            ? `rgba(220,230,255,${0.28 * life * (1 - i * 0.3)})`
            : `rgba(255,255,255,${0.55 * life * (1 - i * 0.3)})`;
        c.lineWidth = r.water ? 1.1 : 1;
        c.beginPath();
        c.ellipse(r.x, r.y, rr, r.water ? rr * 0.26 : rr, 0, 0, TAU);
        c.stroke();
      }
    }
  }

  private drawMotes() {
    const c = this.c, firefly = this.dark && this.scene === "forest";
    const rich = Math.min(1, this.idle / 40);
    const n = Math.round(this.motes.length * (0.55 + 0.45 * rich));
    for (let i = 0; i < n; i++) {
      const m = this.motes[i];
      const tw = 0.5 + 0.5 * Math.sin(this.t * (firefly ? 2.2 : 0.8) + m.p * 7);
      const a = firefly ? Math.pow(tw, 3) * 0.9 : 0.12 + 0.28 * tw;
      const col: RGB = firefly ? [210, 255, 140] : this.scene === "autumn" ? [255, 226, 160] : [235, 248, 255];
      const r = m.s * (firefly ? 2.6 : 2.2);
      const g = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, r * 2.5);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g;
      c.fillRect(m.x - r * 2.5, m.y - r * 2.5, r * 5, r * 5);
    }
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ═══════════════════════════ Theme 1 — Ocean of Consciousness ═══════════════════════════
interface Drop { x: number; y: number; r: number; vy: number; id: number; trail: number }

class Ocean {
  private drops: Drop[] = [];
  private mist: { x: number; y: number; w: number; v: number }[] = [];
  private nextId = 1;
  private trailClock = 0;
  constructor(private w: World) {}

  layout() {
    const { W, H } = this.w;
    this.mist = Array.from({ length: 6 }, (_, i) => ({ x: (i / PHI) * W * 0.9 + rnd(-40, 40), y: H * rnd(0.62, 0.8), w: rnd(160, 380), v: rnd(3, 7) / PHI }));
    this.drops = [];
    for (let i = 0; i < (this.w.mobile ? 10 : 18); i++) this.spawnDew(true);
  }

  horizon() {
    return this.w.H * 0.82;
  }
  /** the living surface: several slow swells whose phases drift, so no wave is ever the same */
  surface(x: number) {
    const t = this.w.t, b = this.w.breath;
    const p1 = noise(t * 0.03) * 6, p2 = noise(t * 0.021 + 9) * 6;
    const amp = 2.6 + 1.6 * (b * 0.5 + 0.5) + this.w.windNow * 3;
    return (
      this.horizon() +
      amp * (0.55 * Math.sin(x * 0.0042 + t * 0.32 + p1) + 0.3 * Math.sin(x * 0.0107 - t * 0.47 + p2) + 0.15 * Math.sin(x * 0.0231 + t * 0.81))
    );
  }

  private spawnDew(anywhere = false) {
    const { W, H } = this.w;
    this.drops.push({ x: rnd(0, W), y: anywhere ? rnd(0, H * 0.72) : rnd(0, H * 0.6), r: rnd(0.8, 2.2), vy: 0, id: this.nextId++, trail: 0 });
  }

  step(dt: number) {
    const w = this.w, rich = Math.min(1, w.idleNow / 40);
    const want = (w.mobile ? 10 : 18) + Math.round(rich * 10);
    if (this.drops.length < want && Math.random() < dt * 0.8) this.spawnDew();
    this.trailClock += dt;
    for (const d of this.drops) {
      if (d.r < 3.6) {
        d.r = Math.min(3.6, d.r + dt * 0.018); // dew gathers slowly
        // a drop heavy enough begins to slide; it sticks, lets go, sticks again
        if (d.r > 3.2 && noise(w.t * 0.4 + d.id) > 0.72) d.vy = Math.max(d.vy, 4);
      }
      if (d.r >= 3.6 || d.vy > 0) {
        const grip = noise(w.t * 0.9 + d.id * 3.1);
        const g = 26 * (d.r / 5);
        d.vy = grip > 0.66 ? d.vy * 0.86 : Math.min(d.vy + g * dt, 70);
        d.y += d.vy * dt;
        d.x += (noise(w.t * 0.5 + d.id) - 0.5) * 10 * dt;
        d.trail = Math.min(26, d.trail + d.vy * dt * 0.4);
        // now and then it leaves a tiny bead behind
        if (d.vy > 6 && this.trailClock > 0.35 && Math.random() < 0.08 && d.r > 2.6) {
          this.drops.push({ x: d.x + rnd(-1, 1), y: d.y - d.r * 2, r: rnd(0.7, 1.3), vy: 0, id: this.nextId++, trail: 0 });
          d.r -= 0.15;
        }
      } else d.trail = Math.max(0, d.trail - dt * 4);
    }
    if (this.trailClock > 0.35) this.trailClock = 0;
    // drops that touch become one
    for (let i = 0; i < this.drops.length; i++) {
      const a = this.drops[i];
      for (let j = i + 1; j < this.drops.length; j++) {
        const b = this.drops[j];
        if (!b.r) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx * dx + dy * dy < (a.r + b.r) * (a.r + b.r) * 0.7) {
          const big = a.y > b.y ? a : b, small = big === a ? b : a;
          big.r = Math.min(7, Math.sqrt(big.r * big.r + small.r * small.r));
          big.vy = Math.max(big.vy, small.vy);
          small.r = 0;
        }
      }
    }
    // reaching the ocean, a drop disappears into it
    this.drops = this.drops.filter((d) => {
      if (!d.r) return false;
      if (d.y > this.surface(d.x) - 2) {
        this.w.ripple(d.x, this.surface(d.x) + 4, true, 40 + d.r * 6);
        return false;
      }
      return d.y < this.w.H + 10;
    });
    for (const m of this.mist) {
      m.x += m.v * dt;
      if (m.x - m.w > this.w.W) m.x = -m.w;
    }
  }

  draw() {
    const w = this.w, c = w.ctx, { W, H } = w, L = w.lightNow, warm = w.warmNow;
    const hz = this.horizon();
    // sky: deep midnight blue overhead, silver-turquoise at the horizon, warmer at dawn and dusk
    const top = mix([6, 12, 30], [112, 152, 182], L);
    const mid = mix(mix([18, 38, 64], [178, 206, 214], L), [222, 190, 170], warm * 0.5);
    const low = mix(mix([30, 56, 80], [214, 232, 234], L), [244, 214, 186], warm * 0.55);
    const g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, rgba(top));
    g.addColorStop(0.62, rgba(mid));
    g.addColorStop(1, rgba(low));
    c.fillStyle = g;
    c.fillRect(-20, -20, W + 40, hz + 30);
    w.drawStars(1 - L * 1.6);
    // the moon (or a pale sun), low, at the golden section
    const lx = W * 0.618, ly = hz - H * (0.2 + 0.08 * L);
    const lum: RGB = L < 0.3 ? [226, 232, 244] : mix([255, 250, 236], [255, 214, 170], warm);
    const halo = c.createRadialGradient(lx, ly, 0, lx, ly, 200);
    halo.addColorStop(0, rgba(lum, 0.55));
    halo.addColorStop(0.12, rgba(lum, 0.22));
    halo.addColorStop(1, rgba(lum, 0));
    c.fillStyle = halo;
    c.fillRect(lx - 200, ly - 200, 400, 400);
    c.fillStyle = rgba(lum, 0.92);
    c.beginPath();
    c.arc(lx, ly, L < 0.3 ? 15 : 19, 0, TAU);
    c.fill();
    w.drawRays(lx, ly, lum, 0.05 + 0.03 * (1 - L), 1.3);
    // distant mist that drifts along the horizon
    for (const m of this.mist) {
      const mg = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.w);
      const mc: RGB = L < 0.3 ? [120, 140, 170] : [255, 255, 255];
      mg.addColorStop(0, rgba(mc, 0.16));
      mg.addColorStop(1, rgba(mc, 0));
      c.fillStyle = mg;
      c.save();
      c.translate(m.x, m.y);
      c.scale(1, 0.22);
      c.translate(-m.x, -m.y);
      c.fillRect(m.x - m.w, m.y - m.w, m.w * 2, m.w * 2);
      c.restore();
    }
    // the water: glass-like, deep, quietly breathing
    const deep = mix([3, 10, 24], [16, 54, 78], L);
    const near = mix(mix([16, 44, 66], [62, 140, 150], L), [70, 120, 110], 0.15); // a hint of emerald
    const wg = c.createLinearGradient(0, hz - 8, 0, H);
    wg.addColorStop(0, rgba(mix(near, low, 0.35)));
    wg.addColorStop(0.35, rgba(near));
    wg.addColorStop(1, rgba(deep));
    c.fillStyle = wg;
    c.beginPath();
    c.moveTo(-20, H + 20);
    for (let x = -20; x <= W + 20; x += 10) c.lineTo(x, this.surface(x));
    c.lineTo(W + 20, H + 20);
    c.closePath();
    c.fill();
    // swell lines below the surface, wider apart as they come closer
    const depth = H - hz;
    for (let i = 1; i <= 8; i++) {
      const d = Math.pow(i / 8, 1.5) * depth;
      c.strokeStyle = `rgba(220,238,245,${0.09 * (1 - i / 10)})`;
      c.lineWidth = 1;
      c.beginPath();
      for (let x = -20; x <= W + 20; x += 14) {
        const y = this.surface(x * (1 + d / 400) + i * 37) + d + Math.sin(x * 0.012 + w.t * (0.4 + i * 0.05) + i) * (1 + d / 30);
        if (x === -20) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    // the moon's path on the water: short glints that come and go
    for (let i = 0; i < 16; i++) {
      const d = Math.pow(i / 16, 1.3) * depth;
      const y = hz + 4 + d;
      const half = (8 + d * 0.5) * (0.4 + noise(w.t * 0.8 + i * 4.7));
      const a = (0.35 - i * 0.015) * (0.4 + 0.6 * noise(w.t * 1.1 + i * 2.3));
      c.strokeStyle = rgba(lum, Math.max(0, a));
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(lx - half + Math.sin(w.t + i) * 3, y);
      c.lineTo(lx + half + Math.sin(w.t + i) * 3, y);
      c.stroke();
    }
    // the surface itself catches the light
    c.strokeStyle = `rgba(240,250,255,${0.22 + 0.1 * L})`;
    c.lineWidth = 1;
    c.beginPath();
    for (let x = -20; x <= W + 20; x += 10) (x === -20 ? c.moveTo : c.lineTo).call(c, x, this.surface(x));
    c.stroke();
    // dew on the window, above it all
    for (const d of this.drops) this.drawDrop(d);
  }

  private drawDrop(d: Drop) {
    const c = this.w.ctx;
    if (d.trail > 1) {
      const tg = c.createLinearGradient(d.x, d.y - d.trail, d.x, d.y);
      tg.addColorStop(0, "rgba(255,255,255,0)");
      tg.addColorStop(1, "rgba(255,255,255,0.13)");
      c.strokeStyle = tg;
      c.lineWidth = d.r * 0.7;
      c.beginPath();
      c.moveTo(d.x, d.y - d.trail);
      c.lineTo(d.x, d.y);
      c.stroke();
    }
    const g = c.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.1, d.x, d.y, d.r);
    g.addColorStop(0, "rgba(255,255,255,0.28)");
    g.addColorStop(0.6, "rgba(255,255,255,0.05)");
    g.addColorStop(1, "rgba(200,225,240,0.22)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(d.x, d.y, d.r * 0.92, d.r * (d.vy > 4 ? 1.12 : 1), 0, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.beginPath();
    c.arc(d.x - d.r * 0.32, d.y - d.r * 0.36, Math.max(0.4, d.r * 0.22), 0, TAU);
    c.fill();
    c.strokeStyle = "rgba(10,30,50,0.12)";
    c.lineWidth = 0.7;
    c.beginPath();
    c.arc(d.x, d.y, d.r, 0.2, Math.PI - 0.2);
    c.stroke();
  }
}

// ═══════════════════════════ Theme 2 — Rainforest of Life ═══════════════════════════
interface Tree { x: number; h: number; w: number; lean: number; blobs: { dx: number; dy: number; r: number }[] }
interface Fly { x: number; y: number; vx: number; vy: number; id: number; hue: RGB; lift: number }

class Forest {
  private layers: Tree[][] = [];
  private ferns: { x: number; s: number; n: number; p: number }[] = [];
  private flies: Fly[] = [];
  private pollen: { x: number; y: number; p: number }[] = [];
  private perches: { x: number; y: number }[] = [];
  // creatures: each simply exists, on its own clock
  private deer = { on: false, x: 0, dir: 1, walk: 0, state: "walk", timer: 0, next: rnd(6, 20), head: 0, ear: 0 };
  private elephant = { on: false, x: 0, dir: -1, walk: 0, next: rnd(60, 140), trunk: 0 };
  private monkey = { at: 0, to: 0, swing: 0, timer: rnd(20, 50), look: 0 };
  private birds: { x: number; y: number; vx: number; flap: number; glide: boolean }[] = [];
  private nextBird = rnd(4, 12);
  private percher = { state: "away", x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, k: 0, timer: rnd(8, 20) };
  private snake = { on: false, x: 0, next: rnd(150, 300) };
  private turtle = { x: 0, timer: 0, moving: 0, head: 0 };
  private dragon = { x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, k: 1, timer: 1 };
  constructor(private w: World) {}

  ground() {
    return this.w.H * 0.9;
  }
  pond() {
    return { x: this.w.W * 0.8, y: this.w.H * 0.935, rx: Math.min(170, this.w.W * 0.14), ry: 14 };
  }

  layout() {
    const { W, H } = this.w, r = seeded(5);
    const counts = this.w.mobile ? [6, 5, 4, 3] : [11, 9, 7, 5];
    this.layers = counts.map((n, d) =>
      Array.from({ length: n }, (_, i) => {
        const x = ((i + 0.5 + (r() - 0.5) * 0.6) / n) * W, h = H * (0.36 + d * 0.07 + r() * 0.12);
        const blobs = Array.from({ length: 5 + Math.floor(r() * 4) }, (_, k) => {
          const a = k * GOLDEN_ANGLE; // leaves arranged by the golden angle
          const rr = Math.sqrt(k + 1) * (16 + d * 6);
          return { dx: Math.cos(a) * rr * 1.3, dy: Math.sin(a) * rr * 0.7, r: 30 + d * 12 + r() * 20 };
        });
        return { x, h, w: 6 + d * 4 + r() * 4, lean: (r() - 0.5) * 0.08, blobs };
      }),
    );
    this.perches = this.layers[2].map((t) => ({ x: t.x + t.blobs[2].dx * 0.6, y: H - t.h * 0.82 }));
    this.ferns = Array.from({ length: this.w.mobile ? 8 : 16 }, (_, i) => ({ x: (i / (this.w.mobile ? 8 : 16)) * W + r() * 60, s: 0.7 + r() * 0.7, n: 5 + Math.floor(r() * 4), p: r() * TAU }));
    this.flies = Array.from({ length: this.w.mobile ? 2 : 4 }, (_, i) => this.newFly(i));
    this.pollen = Array.from({ length: this.w.mobile ? 20 : 40 }, () => ({ x: r() * W, y: r() * H, p: r() * TAU }));
    const p = this.pond();
    this.turtle.x = p.x - p.rx * 0.6;
    Object.assign(this.dragon, { x: p.x, y: p.y - 60, tx: p.x, ty: p.y - 60, fx: p.x, fy: p.y - 60 });
  }

  private newFly(id: number): Fly {
    const hues: RGB[] = [[244, 196, 120], [236, 236, 228], [150, 190, 236], [240, 160, 120]];
    return { x: rnd(0, this.w.W), y: rnd(this.w.H * 0.35, this.w.H * 0.8), vx: 0, vy: 0, id, hue: hues[id % 4], lift: 0 };
  }

  startle(x: number, y: number) {
    for (const f of this.flies) if (Math.hypot(f.x - x, f.y - y) < 220) f.lift = 1.6;
  }

  private sway(x: number, depth: number) {
    const w = this.w;
    return (noise(w.t * 0.25 + x * 0.004 + depth * 3) - 0.5) * (6 + 18 * w.windNow) * (0.4 + depth * 0.25);
  }

  step(dt: number) {
    const w = this.w, { W } = w, G = this.ground(), rich = Math.min(1, w.idleNow / 40);
    // butterflies wander, never on a loop; when the pointer comes near they lift away
    const want = (w.mobile ? 2 : 4) + Math.round(rich * 2);
    while (this.flies.length < want) this.flies.push(this.newFly(this.flies.length));
    for (const f of this.flies) {
      const a = noise(w.t * 0.18 + f.id * 13) * TAU * 2;
      const sp = 26 + 30 * f.lift;
      f.vx = lerp(f.vx, Math.cos(a) * sp + w.windNow * 20, dt * 1.5);
      f.vy = lerp(f.vy, Math.sin(a) * sp * 0.7 - 40 * f.lift, dt * 1.5);
      const p = w.pointerNow, dx = f.x - p.x, dy = f.y - p.y, dd = Math.hypot(dx, dy);
      if (dd < 110) {
        f.lift = Math.min(1.6, f.lift + dt * 3);
        f.vx += (dx / dd) * 80 * dt * 4;
      }
      f.lift = Math.max(0, f.lift - dt * 0.4);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < -30) f.x = W + 20;
      if (f.x > W + 30) f.x = -20;
      f.y = clamp(f.y, w.H * 0.12, G - 20);
    }
    for (const p of this.pollen) {
      p.x += (Math.sin(w.t * 0.2 + p.p) * 4 + w.windNow * 10) * dt;
      p.y += Math.cos(w.t * 0.15 + p.p * 2) * 3 * dt;
      if (p.x > W + 5) p.x = -5;
    }
    // the deer: walks, stops, listens, walks on
    const d = this.deer;
    if (!d.on) {
      d.next -= dt * (1 + rich);
      if (d.next < 0) Object.assign(d, { on: true, dir: Math.random() < 0.5 ? 1 : -1, state: "walk", timer: rnd(4, 8) }), (d.x = d.dir > 0 ? -80 : W + 80);
    } else {
      d.timer -= dt;
      if (d.state === "walk") {
        d.x += d.dir * 20 * dt;
        d.walk += dt * 5;
        d.head = lerp(d.head, 0, dt * 2);
        if (d.timer < 0) Object.assign(d, { state: Math.random() < 0.6 ? "listen" : "graze", timer: rnd(3, 7) });
      } else {
        d.head = lerp(d.head, d.state === "listen" ? 1 : -1, dt * 1.5);
        d.ear = noise(w.t * 2) > 0.8 ? 1 : 0;
        if (d.timer < 0) Object.assign(d, { state: "walk", timer: rnd(4, 9) });
      }
      if (d.x < -120 || d.x > W + 120) Object.assign(d, { on: false, next: rnd(40, 110) });
    }
    // the elephant: rare, slow, unhurried
    const e = this.elephant;
    if (!e.on) {
      e.next -= dt * (1 + rich * 0.5);
      if (e.next < 0) Object.assign(e, { on: true, dir: Math.random() < 0.5 ? 1 : -1 }), (e.x = e.dir > 0 ? -160 : W + 160);
    } else {
      e.x += e.dir * 11 * dt;
      e.walk += dt * 2.2;
      e.trunk = Math.sin(w.t * 0.7) * 0.5 + (noise(w.t * 0.3) - 0.5);
      if (e.x < -200 || e.x > W + 200) Object.assign(e, { on: false, next: rnd(180, 380) });
    }
    // the monkey: sits, watches, now and then swings to another branch
    const m = this.monkey;
    m.timer -= dt;
    if (m.swing > 0) {
      m.swing = Math.min(1, m.swing + dt / 2.4);
      if (m.swing >= 1) Object.assign(m, { at: m.to, swing: 0, timer: rnd(25, 70) });
    } else if (m.timer < 0) {
      m.to = (m.at + 1 + Math.floor(Math.random() * 2)) % this.perches.length;
      m.swing = 0.001;
    }
    m.look = lerp(m.look, clamp((w.pointerNow.x - this.perches[m.at]?.x) / 300, -1, 1), dt);
    // birds: some glide across, one perches, stays a while, leaves
    this.nextBird -= dt * (1 + rich);
    if (this.nextBird < 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.birds.push({ x: dir > 0 ? -30 : W + 30, y: rnd(w.H * 0.08, w.H * 0.35), vx: dir * rnd(40, 70), flap: Math.random() * TAU, glide: Math.random() < 0.5 });
      this.nextBird = rnd(10, 30);
    }
    for (const b of this.birds) {
      b.x += b.vx * dt;
      b.y += Math.sin(w.t * 0.8 + b.flap) * 6 * dt;
      b.flap += dt * (b.glide && Math.sin(w.t * 0.5 + b.flap) > 0 ? 1 : 11);
    }
    this.birds = this.birds.filter((b) => b.x > -60 && b.x < W + 60);
    const pb = this.percher;
    pb.timer -= dt;
    if (pb.state === "away" && pb.timer < 0 && this.perches.length) {
      const t = this.perches[Math.floor(Math.random() * this.perches.length)];
      Object.assign(pb, { state: "in", fx: Math.random() < 0.5 ? -30 : W + 30, fy: rnd(0, w.H * 0.3), tx: t.x, ty: t.y - 4, k: 0 });
    } else if (pb.state === "in" || pb.state === "out") {
      pb.k = Math.min(1, pb.k + dt / 2.6);
      const e2 = easeInOut(pb.k);
      pb.x = lerp(pb.fx, pb.tx, e2);
      pb.y = lerp(pb.fy, pb.ty, e2) - Math.sin(pb.k * Math.PI) * 40;
      if (pb.k >= 1) Object.assign(pb, pb.state === "in" ? { state: "sit", timer: rnd(6, 16) } : { state: "away", timer: rnd(14, 34) });
    } else if (pb.state === "sit" && pb.timer < 0) {
      Object.assign(pb, { state: "out", fx: pb.x, fy: pb.y, tx: Math.random() < 0.5 ? -40 : W + 40, ty: rnd(0, w.H * 0.25), k: 0 });
    }
    // the snake: very rare, slow, almost unnoticed
    const s = this.snake;
    if (!s.on) {
      s.next -= dt * (1 + rich * 0.5);
      if (s.next < 0) Object.assign(s, { on: true, x: -120 });
    } else {
      s.x += 14 * dt;
      if (s.x > W * 0.62) Object.assign(s, { on: false, next: rnd(240, 480) }); // gone into the ferns
    }
    // the turtle: moves only a little
    const tu = this.turtle;
    tu.timer -= dt;
    if (tu.timer < 0) Object.assign(tu, { moving: rnd(4, 8), timer: rnd(30, 70) });
    if (tu.moving > 0) {
      tu.moving -= dt;
      tu.x += 0.9 * dt;
    }
    tu.head = lerp(tu.head, tu.moving > 0 ? 1 : 0.35, dt);
    // the dragonfly: hovers, darts, hovers
    const dg = this.dragon, p = this.pond();
    dg.timer -= dt;
    if (dg.timer < 0) Object.assign(dg, { fx: dg.x, fy: dg.y, tx: p.x + rnd(-p.rx, p.rx), ty: p.y - rnd(30, 110), k: 0, timer: rnd(2, 5) });
    dg.k = Math.min(1, dg.k + dt * 2.5);
    const ek = 1 - (1 - dg.k) ** 3;
    dg.x = lerp(dg.fx, dg.tx, ek) + Math.sin(w.t * 9) * 0.8;
    dg.y = lerp(dg.fy, dg.ty, ek) + Math.cos(w.t * 7) * 0.8;
  }

  draw() {
    const w = this.w, c = w.ctx, { W, H } = w, L = w.lightNow, G = this.ground();
    // morning light through the canopy
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, rgba(mix([8, 20, 18], [222, 236, 220], L)));
    sky.addColorStop(0.5, rgba(mix(mix([12, 30, 26], [160, 196, 160], L), [220, 196, 150], w.warmNow * 0.4)));
    sky.addColorStop(1, rgba(mix([6, 16, 14], [92, 124, 96], L)));
    c.fillStyle = sky;
    c.fillRect(-20, -20, W + 40, H + 40);
    w.drawStars((0.3 - L) * 2);
    const tint: RGB = L < 0.3 ? [150, 170, 210] : mix([255, 248, 214], [255, 220, 160], w.warmNow);
    // the layers of the forest, far to near, with mist between them
    const far: RGB = mix([18, 34, 32], [176, 198, 180], L), nearC: RGB = mix([4, 12, 10], [52, 84, 62], L);
    this.layers.forEach((layer, d) => {
      const col = mix(far, nearC, d / 3);
      c.fillStyle = rgba(col, 0.92);
      c.strokeStyle = rgba(col, 0.92);
      for (const t of layer) {
        const top = H - t.h, sx = this.sway(t.x, d);
        c.lineWidth = t.w;
        c.beginPath();
        c.moveTo(t.x, H);
        c.quadraticCurveTo(t.x + t.lean * t.h, H - t.h * 0.5, t.x + sx * 0.3 + t.lean * t.h, top);
        c.stroke();
        for (const b of t.blobs) {
          c.beginPath();
          c.ellipse(t.x + t.lean * t.h + b.dx + sx * (0.6 + b.r / 80), top + b.dy, b.r, b.r * 0.72, 0, 0, TAU);
          c.fill();
        }
      }
      if (d === 1) this.drawCreaturesFar();
      // mist between the layers
      const mg = c.createLinearGradient(0, H * 0.35, 0, H);
      const mc: RGB = L < 0.3 ? [70, 90, 110] : [236, 242, 232];
      mg.addColorStop(0, rgba(mc, 0));
      mg.addColorStop(0.6, rgba(mc, 0.16 - d * 0.03));
      mg.addColorStop(1, rgba(mc, 0.06));
      c.fillStyle = mg;
      c.fillRect(-20, H * 0.35, W + 40, H * 0.66);
    });
    // shafts of light through the canopy (placed at golden sections)
    w.drawRays(W * 0.382, -40, tint, 0.07 + 0.05 * L, 0.5, Math.PI / 2 + 0.25);
    // ground, pond and ferns
    const gg = c.createLinearGradient(0, G - 10, 0, H);
    gg.addColorStop(0, rgba(mix([6, 14, 10], [40, 62, 40], L), 0.95));
    gg.addColorStop(1, rgba(mix([2, 8, 6], [22, 36, 24], L)));
    c.fillStyle = gg;
    c.fillRect(-20, G - 6, W + 40, H - G + 30);
    const p = this.pond();
    const pg = c.createLinearGradient(0, p.y - p.ry, 0, p.y + p.ry);
    pg.addColorStop(0, rgba(mix([30, 50, 70], [190, 216, 206], L), 0.95));
    pg.addColorStop(1, rgba(mix([10, 24, 30], [80, 120, 110], L), 0.95));
    c.fillStyle = pg;
    c.beginPath();
    c.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU);
    c.fill();
    c.strokeStyle = `rgba(255,255,255,${0.12 + 0.1 * L})`;
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(p.x, p.y - 1, p.rx * 0.8 + Math.sin(w.t * 0.6) * 4, p.ry * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    this.drawCreaturesNear();
    for (const f of this.ferns) this.drawFern(f.x, G + 8, f.s, f.n, f.p, nearC);
    // pollen in the light (fireflies at night are drawn as the common motes)
    if (L > 0.3) {
      c.fillStyle = rgba(tint, 0.55);
      for (const q of this.pollen) {
        const a = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(w.t + q.p * 5));
        c.globalAlpha = a;
        c.fillRect(q.x, q.y, 1.4, 1.4);
      }
      c.globalAlpha = 1;
    }
    for (const f of this.flies) this.drawButterfly(f);
  }

  private drawFern(x: number, y: number, s: number, n: number, p: number, col: RGB) {
    const c = this.w.ctx, sw = this.sway(x, 3) * 0.06;
    c.strokeStyle = rgba(col, 0.95);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.9 + sw + Math.sin(this.w.t * 0.6 + p + i) * 0.03;
      const len = 46 * s * (0.7 + 0.3 * Math.sin(i * 2.1 + p));
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 - 8 * s, ex, ey);
      c.stroke();
      c.lineWidth = 1;
      for (let k = 1; k < 7; k++) {
        const u = k / 7, px = x + (ex - x) * u, py = y + (ey - y) * u - Math.sin(u * Math.PI) * 6 * s, l = (1 - u) * 9 * s;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(px + Math.cos(a - 1.2) * l, py + Math.sin(a - 1.2) * l);
        c.moveTo(px, py);
        c.lineTo(px + Math.cos(a + 1.2) * l, py + Math.sin(a + 1.2) * l);
        c.stroke();
      }
    }
  }

  private ink(alpha = 0.9): string {
    return rgba(mix([10, 20, 18], [34, 52, 42], this.w.lightNow), alpha);
  }

  private drawCreaturesFar() {
    const c = this.w.ctx, e = this.elephant;
    if (!e.on) return;
    // the elephant walks between the far trees, half in mist
    const s = 1.25, G = this.ground() - 20, x = e.x, dir = e.dir;
    c.fillStyle = rgba(mix([20, 36, 34], [96, 120, 108], this.w.lightNow), 0.85);
    c.save();
    c.translate(x, G);
    c.scale(dir * s, s);
    for (let i = 0; i < 4; i++) {
      const lx = [-30, -18, 16, 28][i], sw = Math.sin(e.walk + i * 1.6) * 4;
      c.fillRect(lx + sw - 5, -36, 10, 36);
    }
    c.beginPath();
    c.ellipse(0, -52, 44, 28, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(46, -62, 18, 17, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(36, -60, 12, 16, -0.2, 0, TAU); // the ear
    c.fill();
    c.lineWidth = 7;
    c.lineCap = "round";
    c.strokeStyle = c.fillStyle as string;
    c.beginPath();
    c.moveTo(60, -58);
    c.quadraticCurveTo(70 + e.trunk * 6, -30, 62 + e.trunk * 8, -6);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-44, -54);
    c.lineTo(-50, -34 + Math.sin(e.walk) * 2);
    c.stroke();
    c.restore();
    c.lineCap = "butt";
  }

  private drawCreaturesNear() {
    const w = this.w, c = w.ctx, G = this.ground();
    // the deer
    const d = this.deer;
    if (d.on) {
      c.save();
      c.translate(d.x, G);
      c.scale(d.dir * 0.9, 0.9);
      c.fillStyle = this.ink();
      c.strokeStyle = this.ink();
      c.lineCap = "round";
      c.lineWidth = 3.2;
      const legs: [number, number][] = [[-16, 0], [-10, 2.2], [14, 1.2], [20, 3.4]];
      for (const [lx, ph] of legs) {
        const sw = d.state === "walk" ? Math.sin(d.walk + ph) * 6 : 0;
        c.beginPath();
        c.moveTo(lx, -30);
        c.lineTo(lx + sw * 0.5, -15);
        c.lineTo(lx + sw, 0);
        c.stroke();
      }
      c.beginPath();
      c.ellipse(0, -36, 26, 11, 0, 0, TAU);
      c.fill();
      const hy = d.head > 0 ? -66 - d.head * 6 : -66 - d.head * 28; // listening: up; grazing: down
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(20, -40);
      c.lineTo(30, hy + 6);
      c.stroke();
      c.beginPath();
      c.ellipse(36, hy + 4, 9, 5, 0.35, 0, TAU);
      c.fill();
      c.beginPath(); // ears
      c.ellipse(28, hy - 2 - d.ear * 2, 2.5, 7, -0.5 - d.ear * 0.3, 0, TAU);
      c.fill();
      c.beginPath();
      c.ellipse(-26, -40, 5, 3, -0.6, 0, TAU); // tail
      c.fill();
      c.restore();
      c.lineCap = "butt";
    }
    // the snake, low among the ferns
    const s = this.snake;
    if (s.on) {
      c.strokeStyle = this.ink(0.75);
      c.lineWidth = 4;
      c.lineCap = "round";
      c.beginPath();
      for (let i = 0; i < 26; i++) {
        const x = s.x - i * 5, y = G + 4 + Math.sin(i * 0.5 - w.t * 2) * 4;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.lineCap = "butt";
    }
    // the monkey on its branch
    const m = this.monkey, from = this.perches[m.at], to = this.perches[m.to];
    if (from) {
      let x = from.x, y = from.y;
      if (m.swing > 0 && to) {
        const k = easeInOut(m.swing);
        x = lerp(from.x, to.x, k);
        y = lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * 50;
      }
      c.fillStyle = this.ink(0.95);
      c.strokeStyle = this.ink(0.95);
      c.beginPath();
      c.ellipse(x, y - 9, 7, 9, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.arc(x + m.look * 2, y - 21, 5.5, 0, TAU);
      c.fill();
      c.lineWidth = 2;
      c.beginPath(); // the tail hangs and sways
      c.moveTo(x - 4, y - 2);
      c.bezierCurveTo(x - 10, y + 14, x + 6 + Math.sin(w.t) * 4, y + 22, x - 2, y + 30);
      c.stroke();
      if (m.swing > 0) {
        c.beginPath();
        c.moveTo(x, y - 14);
        c.lineTo(x + 2, y - 34);
        c.stroke();
      }
    }
    // the birds
    c.strokeStyle = this.ink(0.85);
    c.lineWidth = 1.6;
    for (const b of this.birds) {
      const f = Math.sin(b.flap) * 5;
      c.beginPath();
      c.moveTo(b.x - 8, b.y - f);
      c.quadraticCurveTo(b.x - 3, b.y - 2, b.x, b.y);
      c.quadraticCurveTo(b.x + 3, b.y - 2, b.x + 8, b.y - f);
      c.stroke();
    }
    const pb = this.percher;
    if (pb.state !== "away") {
      c.fillStyle = this.ink(0.95);
      c.beginPath();
      c.ellipse(pb.x, pb.y - 4, 6, 4.5, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.arc(pb.x + 4, pb.y - 8, 3, 0, TAU);
      c.fill();
      if (pb.state !== "sit") {
        const f = Math.sin(w.t * 20) * 6;
        c.beginPath();
        c.moveTo(pb.x - 2, pb.y - 6);
        c.lineTo(pb.x - 8, pb.y - 6 - f);
        c.lineTo(pb.x + 4, pb.y - 6);
        c.fill();
      }
    }
    // the turtle by the water, the dragonfly above it
    const p = this.pond(), tu = this.turtle, ty = p.y - p.ry * 0.4;
    c.fillStyle = this.ink(0.95);
    c.beginPath();
    c.ellipse(tu.x, ty - 5, 14, 8, 0, Math.PI, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(tu.x + 14 + tu.head * 4, ty - 4, 4, 3, 0, 0, TAU);
    c.fill();
    const dg = this.dragon;
    c.strokeStyle = this.ink(0.9);
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(dg.x - 9, dg.y);
    c.lineTo(dg.x + 5, dg.y);
    c.stroke();
    const glint = 0.25 + 0.35 * Math.abs(Math.sin(w.t * 30));
    c.fillStyle = `rgba(235,250,255,${glint * (0.4 + 0.6 * w.lightNow)})`;
    c.beginPath();
    c.ellipse(dg.x - 1, dg.y - 3, 7, 1.8, -0.3, 0, TAU);
    c.ellipse(dg.x - 1, dg.y + 3, 7, 1.8, 0.3, 0, TAU);
    c.fill();
  }

  private drawButterfly(f: Fly) {
    const c = this.w.ctx, flap = Math.abs(Math.sin(this.w.t * (12 + f.lift * 6) + f.id));
    const col = rgba(mix(f.hue, [60, 70, 80], 1 - Math.max(0.35, this.w.lightNow)), 0.9);
    c.fillStyle = col;
    c.save();
    c.translate(f.x, f.y);
    c.rotate(Math.atan2(f.vy, f.vx) * 0.15);
    c.scale(1, 0.4 + flap * 0.6);
    c.beginPath();
    c.ellipse(-3, -3, 4.5, 3.4, -0.5, 0, TAU);
    c.ellipse(3, -3, 4.5, 3.4, 0.5, 0, TAU);
    c.ellipse(-2, 2.4, 3, 2.2, 0.4, 0, TAU);
    c.ellipse(2, 2.4, 3, 2.2, -0.4, 0, TAU);
    c.fill();
    c.restore();
  }
}

// ═══════════════════════════ Theme 3 — The Sparrow and the Autumn Tree ═══════════════════════════
interface Branch { x: number; y: number; a: number; len: number; w: number; depth: number; kids: Branch[]; leaves: { a: number; d: number; c: RGB }[] }
interface Leaf { x: number; y: number; vx: number; vy: number; rot: number; vr: number; flip: number; vf: number; s: number; c: RGB; landed: number; ph: number }
type Piece = "twig" | "grass" | "leaf" | "feather";

const NEST_PIECES = 36; // about one every 25 seconds: a home in some fifteen minutes
const AUTUMN: RGB[] = [[214, 150, 60], [196, 112, 46], [226, 178, 84], [168, 82, 40], [190, 140, 70], [232, 196, 120]];

class Autumn {
  private root: Branch | null = null;
  private tips: { x: number; y: number }[] = [];
  private nestAt = { x: 0, y: 0 };
  private leaves: Leaf[] = [];
  private pieces: { a: number; r: number; type: Piece; l: number }[] = [];
  private bird = { state: "away", timer: 3, x: -40, y: 0, fx: 0, fy: 0, k: 0, carry: "twig" as Piece, hop: 0, look: 0 };
  private released = 0;
  constructor(private w: World) {
    this.restore();
  }

  layout() {
    const { W, H } = this.w, r = seeded(23);
    const maxDepth = this.w.mobile ? 6 : 7;
    const grow = (x: number, y: number, a: number, len: number, wd: number, depth: number): Branch => {
      const b: Branch = { x, y, a, len, w: wd, depth, kids: [], leaves: [] };
      if (depth < maxDepth) {
        const n = depth < 2 ? 2 : r() < 0.35 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          // the branching follows the golden angle, loosely, as old trees do
          const spread = (GOLDEN_ANGLE / PHI) * (0.55 + r() * 0.5);
          const da = (i - (n - 1) / 2) * spread + (r() - 0.5) * 0.25 - 0.08;
          b.kids.push(grow(0, 0, da, len * (0.7 + r() * 0.12), wd * 0.66, depth + 1));
        }
      }
      if (depth >= maxDepth - 2) {
        b.leaves = Array.from({ length: depth === maxDepth ? 7 : 3 }, (_, i) => ({ a: i * GOLDEN_ANGLE, d: 6 + Math.sqrt(i) * 7, c: AUTUMN[Math.floor(r() * AUTUMN.length)] }));
      }
      return b;
    };
    const trunk = Math.min(H * 0.24, 210);
    this.root = grow(W * 0.84, H + 10, -Math.PI / 2 - 0.12, trunk, Math.min(34, W * 0.025), 0);
  }

  private restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem("living-nest") ?? "[]");
      if (Array.isArray(saved)) this.pieces = saved.slice(0, NEST_PIECES);
    } catch {}
  }
  private save() {
    try {
      sessionStorage.setItem("living-nest", JSON.stringify(this.pieces));
    } catch {}
  }

  shake(x: number) {
    // a touch near the tree lets a few leaves go
    this.released += 3 + (Math.abs(x - this.w.W * 0.8) < 260 ? 4 : 0);
  }

  private spawnLeaf(at?: { x: number; y: number }) {
    const t = at ?? this.tips[Math.floor(Math.random() * this.tips.length)];
    if (!t) return;
    this.leaves.push({
      x: t.x, y: t.y, vx: 0, vy: rnd(8, 16), rot: Math.random() * TAU, vr: rnd(-1.2, 1.2), flip: Math.random() * TAU, vf: rnd(1.4, 3.2),
      s: rnd(4.5, 7.5), c: AUTUMN[Math.floor(Math.random() * AUTUMN.length)], landed: 0, ph: Math.random() * TAU,
    });
  }

  step(dt: number) {
    const w = this.w, { W, H } = w, rich = Math.min(1, w.idleNow / 40);
    // leaves never stop
    const rate = (this.w.mobile ? 0.5 : 0.9) + w.windNow * 2.5 + rich * 0.6;
    if (Math.random() < rate * dt) this.spawnLeaf();
    while (this.released > 0) {
      this.spawnLeaf();
      this.released--;
    }
    for (const l of this.leaves) {
      if (l.landed) {
        l.landed += dt;
        continue;
      }
      l.flip += l.vf * dt;
      l.rot += l.vr * dt;
      const flutter = Math.sin(w.t * 1.7 + l.ph) * 22 + (noise(w.t * 0.4 + l.ph) - 0.5) * 30;
      l.vx = lerp(l.vx, flutter - 8 - w.windNow * 70, dt * 1.2);
      l.vy = lerp(l.vy, 18 + 14 * Math.abs(Math.cos(l.flip)), dt);
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      const ground = H - 6 - (l.ph % 1) * 26;
      if (l.y > ground) Object.assign(l, { y: ground, landed: 0.001 });
    }
    this.leaves = this.leaves.filter((l) => l.x > -40 && (!l.landed || l.landed < 45));
    if (this.leaves.length > 160) this.leaves.splice(0, this.leaves.length - 160);
    // the sparrow builds its nest: away, back with one piece, places it, rests, away again
    const b = this.bird, gust = w.windNow > 0.62;
    if (!gust || b.state === "away" || b.state === "in" || b.state === "out") b.timer -= dt;
    const done = this.pieces.length >= NEST_PIECES;
    const n = this.nestAt;
    if (b.state === "away" && b.timer < 0) {
      const side = Math.random() < 0.5 ? -40 : W + 40;
      const kinds: Piece[] = ["twig", "grass", "leaf", "twig", "feather", "grass"];
      Object.assign(b, { state: "in", fx: side, fy: rnd(H * 0.05, H * 0.4), k: 0, carry: done ? "none" : kinds[this.pieces.length % kinds.length] });
    } else if (b.state === "in" || b.state === "out") {
      b.k = Math.min(1, b.k + dt / (b.state === "in" ? 3.6 : 2.6));
      const e = easeInOut(b.k), tx = b.state === "in" ? n.x + 16 : b.fx, ty = b.state === "in" ? n.y - 14 : b.fy;
      const sx = b.state === "in" ? b.fx : n.x + 16, sy = b.state === "in" ? b.fy : n.y - 14;
      b.x = lerp(sx, tx, e);
      b.y = lerp(sy, ty, e) - Math.sin(b.k * Math.PI) * 50;
      if (b.k >= 1) Object.assign(b, b.state === "in" ? { state: "place", timer: 1.8, hop: 0 } : { state: "away", timer: rnd(7, 16) });
    } else if (b.state === "place") {
      b.hop += dt;
      if (b.timer < 0) {
        if (!done && b.carry !== ("none" as Piece)) {
          const i = this.pieces.length;
          this.pieces.push({ a: i * GOLDEN_ANGLE, r: 0.55 + (i % 5) * 0.11, type: b.carry, l: rnd(0.6, 1.1) });
          this.save();
        }
        Object.assign(b, { state: "rest", timer: rnd(2.5, 6) });
      }
    } else if (b.state === "rest") {
      b.look = Math.sin(w.t * 0.9) > 0.6 ? 1 : 0;
      if (b.timer < 0) Object.assign(b, done && Math.random() < 0.6 ? { state: "rest", timer: rnd(8, 20) } : { state: "out", fx: Math.random() < 0.5 ? -40 : W + 40, fy: rnd(H * 0.05, H * 0.35), k: 0 });
    }
    if (b.state === "place" || b.state === "rest") {
      b.x = n.x + 16;
      b.y = n.y - 14;
    }
  }

  draw() {
    const w = this.w, c = w.ctx, { W, H } = w, L = w.lightNow, warm = Math.max(w.warmNow, 0.55);
    // soft afternoon light, gold low in the sky
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(mix([14, 14, 30], mix([176, 196, 214], [214, 190, 170], warm * 0.6), L)));
    g.addColorStop(0.55, rgba(mix([30, 24, 34], mix([238, 214, 176], [246, 200, 140], warm * 0.7), L)));
    g.addColorStop(1, rgba(mix([24, 18, 18], [214, 170, 110], L)));
    c.fillStyle = g;
    c.fillRect(-20, -20, W + 40, H + 40);
    w.drawStars((0.32 - L) * 2.4);
    const sun: RGB = L < 0.3 ? [230, 220, 200] : [255, 226, 170];
    const sx = W * 0.2, sy = H * (0.46 - 0.12 * L);
    const halo = c.createRadialGradient(sx, sy, 0, sx, sy, 260);
    halo.addColorStop(0, rgba(sun, 0.6));
    halo.addColorStop(0.15, rgba(sun, 0.22));
    halo.addColorStop(1, rgba(sun, 0));
    c.fillStyle = halo;
    c.fillRect(sx - 260, sy - 260, 520, 520);
    w.drawRays(sx, sy, sun, 0.06 + 0.04 * L, 1.6, 0.1);
    // far hills in haze
    for (let i = 0; i < 2; i++) {
      c.fillStyle = rgba(mix(mix([40, 30, 40], [196, 160, 140], L), [230, 200, 170], i * 0.3), 0.55 - i * 0.2);
      c.beginPath();
      c.moveTo(-20, H);
      for (let x = -20; x <= W + 20; x += 24) c.lineTo(x, H * (0.78 + i * 0.06) - 40 * noise(x * 0.004 + i * 9) - 20 * noise(x * 0.013 + i));
      c.lineTo(W + 20, H);
      c.fill();
    }
    // the ground, gold with fallen leaves
    const gg = c.createLinearGradient(0, H * 0.93, 0, H);
    gg.addColorStop(0, rgba(mix([30, 22, 16], [170, 122, 70], L)));
    gg.addColorStop(1, rgba(mix([16, 12, 10], [120, 80, 44], L)));
    c.fillStyle = gg;
    c.fillRect(-20, H * 0.93, W + 40, H * 0.1);
    // the ancient tree, swaying with the wind
    this.tips = [];
    let best = { score: -1e9, x: 0, y: 0 };
    if (this.root) {
      const bark = rgba(mix([18, 12, 10], [70, 48, 34], L));
      const walk = (b: Branch, x: number, y: number, a: number) => {
        const sway = (noise(w.t * 0.3 + b.depth * 1.7 + x * 0.002) - 0.5) * 0.05 * b.depth * (0.4 + w.windNow * 1.6) + 0.002 * w.breath;
        const ang = a + b.a + sway;
        const x2 = x + Math.cos(ang) * b.len, y2 = y + Math.sin(ang) * b.len;
        c.strokeStyle = bark;
        c.lineWidth = b.w;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x2, y2);
        c.stroke();
        // the nest sits in a fork in the upper crown, where it can be seen
        if (b.depth === 3) {
          const score = -Math.abs(y2 - H * 0.26) - Math.abs(x2 - W * 0.76) * 0.6;
          if (score > best.score) best = { score, x: x2, y: y2 };
        }
        for (const k of b.kids) walk(k, x2, y2, ang);
        if (b.leaves.length) {
          this.tips.push({ x: x2, y: y2 });
          for (const lf of b.leaves) {
            const lx = x2 + Math.cos(lf.a + sway * 4) * lf.d, ly = y2 + Math.sin(lf.a + sway * 4) * lf.d * 0.7;
            c.fillStyle = rgba(mix(lf.c, [40, 26, 20], 1 - Math.max(0.3, L)), 0.9);
            c.beginPath();
            c.ellipse(lx, ly, 5.2, 3.2, lf.a, 0, TAU);
            c.fill();
          }
        }
      };
      walk(this.root, this.root.x, this.root.y, 0);
      c.lineCap = "butt";
      this.nestAt = { x: best.x, y: best.y };
    }
    this.drawNest();
    this.drawSparrow();
    // the leaves, each catching the light as it turns
    for (const l of this.leaves) {
      const face = Math.abs(Math.cos(l.flip));
      const lit = l.landed ? 0.8 : 0.7 + 0.4 * Math.abs(Math.sin(l.flip));
      const col = mix(l.c, [40, 26, 20], 1 - Math.max(0.3, L));
      c.fillStyle = rgba([Math.min(255, col[0] * lit), Math.min(255, col[1] * lit), Math.min(255, col[2] * lit)], l.landed ? Math.max(0, 1 - l.landed / 45) * 0.9 : 0.92);
      c.save();
      c.translate(l.x, l.y);
      c.rotate(l.rot);
      c.scale(l.landed ? 1 : 0.25 + face * 0.75, l.landed ? 0.5 : 1);
      c.beginPath();
      c.moveTo(-l.s, 0);
      c.quadraticCurveTo(0, -l.s * 0.75, l.s, 0);
      c.quadraticCurveTo(0, l.s * 0.75, -l.s, 0);
      c.fill();
      c.restore();
    }
  }

  private drawNest() {
    const c = this.w.ctx, { x, y } = this.nestAt, n = this.pieces.length;
    if (!n) return;
    const L = this.w.lightNow, R = 25;
    // a little light where the home is being made, so the eye can find it among the leaves
    const halo = c.createRadialGradient(x, y, 0, x, y, 70);
    halo.addColorStop(0, `rgba(255,240,205,${0.32 + 0.05 * this.w.breath})`);
    halo.addColorStop(1, "rgba(255,240,205,0)");
    c.fillStyle = halo;
    c.fillRect(x - 70, y - 70, 140, 140);
    const COL: Record<Piece, RGB> = { twig: [92, 64, 40], grass: [150, 140, 80], leaf: [200, 150, 70], feather: [236, 230, 220] };
    c.lineCap = "round";
    // woven round the bowl, each piece at the golden angle from the last
    this.pieces.forEach((p, i) => {
      const a0 = p.a, len = p.l;
      c.strokeStyle = rgba(mix(COL[p.type], [30, 20, 16], 1 - Math.max(0.35, L)), 0.95);
      c.lineWidth = p.type === "feather" ? 2 : p.type === "grass" ? 1.4 : 2.6;
      c.beginPath();
      const rr = R * p.r, cy = y + 4 + (i / NEST_PIECES) * -3;
      c.ellipse(x, cy, rr * 1.25, rr * 0.55, 0, a0 % Math.PI, (a0 % Math.PI) + len);
      c.stroke();
    });
    if (n >= NEST_PIECES) {
      // complete: a small egg, and a warmth around the home
      const glow = c.createRadialGradient(x, y, 0, x, y, 60);
      glow.addColorStop(0, `rgba(255,230,170,${0.18 + 0.06 * this.w.breath})`);
      glow.addColorStop(1, "rgba(255,230,170,0)");
      c.fillStyle = glow;
      c.fillRect(x - 60, y - 60, 120, 120);
      c.fillStyle = "rgba(196,220,226,0.95)";
      c.beginPath();
      c.ellipse(x - 4, y - 1, 3.6, 4.6, -0.2, 0, TAU);
      c.fill();
    }
    c.lineCap = "butt";
  }

  private drawSparrow() {
    const b = this.bird;
    if (b.state === "away") return;
    const c = this.w.ctx, L = this.w.lightNow, flying = b.state === "in" || b.state === "out";
    const dir = flying ? (b.state === "in" ? (b.fx < this.nestAt.x ? 1 : -1) : b.fx > this.nestAt.x ? 1 : -1) : b.look ? -1 : 1;
    const hop = b.state === "place" ? Math.abs(Math.sin(b.hop * 7)) * 2.5 : 0;
    const body = rgba(mix([60, 44, 32], [134, 96, 62], L));
    c.save();
    c.translate(b.x, b.y - hop);
    c.scale(dir * 1.55, 1.55);
    c.fillStyle = body;
    c.beginPath();
    c.ellipse(0, 0, 8, 5.6, -0.15, 0, TAU);
    c.fill();
    c.fillStyle = rgba(mix([90, 80, 70], [214, 196, 170], L)); // the pale breast
    c.beginPath();
    c.ellipse(2, 2, 5, 3.2, -0.2, 0, TAU);
    c.fill();
    c.fillStyle = body;
    c.beginPath();
    c.arc(7, -4, 3.8, 0, TAU);
    c.fill();
    c.beginPath(); // tail
    c.moveTo(-6, -1);
    c.lineTo(-14, -4);
    c.lineTo(-13, 1);
    c.fill();
    c.fillStyle = "#1c140e";
    c.beginPath();
    c.arc(8.2, -4.6, 0.8, 0, TAU);
    c.fill();
    c.beginPath(); // beak
    c.moveTo(10.5, -4);
    c.lineTo(13.5, -3.2);
    c.lineTo(10.5, -2.6);
    c.fill();
    if (flying) {
      const f = Math.sin(this.w.t * 26) * 7;
      c.fillStyle = rgba(mix([50, 36, 26], [110, 78, 50], L));
      c.beginPath();
      c.moveTo(-2, -3);
      c.lineTo(-6, -3 - f);
      c.lineTo(4, -3);
      c.fill();
    }
    // what it carries home
    if (b.carry && b.state !== "rest" && b.state !== "out" && (b.carry as string) !== "none") {
      const col: Record<Piece, string> = { twig: "#5c4028", grass: "#968c50", leaf: "#c8964a", feather: "#efe9dc" };
      c.strokeStyle = col[b.carry];
      c.lineWidth = b.carry === "feather" ? 2 : 1.3;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(11, -2.8);
      c.quadraticCurveTo(15, 0, 20, -1 + Math.sin(this.w.t * 4) * 1.5);
      c.stroke();
      c.lineCap = "butt";
    }
    c.restore();
  }
}
