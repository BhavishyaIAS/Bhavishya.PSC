/**
 * A tiny 3D renderer for the page backdrops: real geometry (solids, wires, point
 * clouds, labels) with perspective, flat shading, depth fog and depth sorting,
 * drawn on a 2D canvas. No dependencies, ~a few hundred polygons per scene.
 *
 * Conventions: +y is up, the camera sits at (0, 0, -CAM) looking towards +z.
 */

export type V3 = [number, number, number];

export interface Mesh {
  v: V3[];
  f: number[][]; // faces: vertex indices, wound so the normal points outwards
  l: number[][]; // polylines: vertex indices
}

export interface Item {
  mesh?: Mesh;
  pts?: V3[]; // point cloud, in the item's own space
  glyph?: string; // a letter/symbol drawn as a billboard at the item's origin
  pos: V3;
  rot: V3;
  scale: number;
  stretch?: V3;
  color: number; // palette index for faces / points / glyph
  line?: number; // palette index for lines (default: ink)
  alpha: number;
  ds?: boolean; // double-sided faces (sheets, bands)
  size?: number; // point radius, glyph size or line width
  tick?: (it: Item, t: number) => void;
}

export interface Scene {
  items: Item[];
  spin: number; // world rotation, radians per second
  sway?: number; // instead of turning all the way round, rock left-right by this many radians
  tilt: number; // camera pitch (negative looks down on the scene)
  zoom?: number;
}

/** Palette slots. */
export const RED = 0, BLUE = 1, VIOLET = 2, PAPER = 3, GREEN = 4, GOLD = 5, INK = 6;

export interface View {
  w: number;
  h: number;
  cx: number;
  cy: number;
  unit: number; // pixels per world unit at the focal plane
  px: number; // pointer, -1..1
  py: number;
  alpha: number;
  palette: number[][]; // rgb triplets: 7 colours, then shadow, then light
  font: string;
}

const CAM = 5;

// ───────────────────────────── maths ─────────────────────────────

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function centroid(pts: V3[]): V3 {
  const c: V3 = [0, 0, 0];
  for (const p of pts) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
}

/** Newell's method: a robust normal for any planar polygon (convex or not). */
function newell(pts: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

/** Rotation matrix for Euler angles applied x, then y, then z. */
function euler(rx: number, ry: number, rz: number): number[] {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}
const apply = (m: number[], p: V3): V3 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
  m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
  m[6] * p[0] + m[7] * p[1] + m[8] * p[2],
];

/** Rotate a point by Euler angles (x, then y, then z). */
export const rotate = (p: V3, rot: V3): V3 => apply(euler(rot[0], rot[1], rot[2]), p);

// ───────────────────────────── geometry ─────────────────────────────

const mesh = (v: V3[], f: number[][] = [], l: number[][] = []): Mesh => ({ v, f, l });

/** Wind every face so its normal points away from the solid's centre (for convex-ish solids). */
function orient(m: Mesh): Mesh {
  const c = centroid(m.v);
  for (const face of m.f) {
    const pts = face.map((i) => m.v[i]);
    if (dot(newell(pts), sub(centroid(pts), c)) < 0) face.reverse();
  }
  return m;
}

export function box(w: number, h: number, d: number): Mesh {
  const x = w / 2, y = h / 2, z = d / 2;
  return orient(
    mesh(
      [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],
      [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]],
    ),
  );
}

/** A cylinder / cone / truncated cone standing on y = y0. A radius of 0 makes a point; caps = false leaves it open (a band). */
export function frustum(n: number, r1: number, r2: number, h: number, y0 = 0, caps = true): Mesh {
  const v: V3[] = [], f: number[][] = [];
  const ringAt = (r: number, y: number) => {
    const start = v.length;
    if (r === 0) {
      v.push([0, y, 0]);
      return [start];
    }
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      v.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    return Array.from({ length: n }, (_, i) => start + i);
  };
  const a = ringAt(r1, y0), b = ringAt(r2, y0 + h);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (a.length === 1) f.push([a[0], b[i], b[j]]);
    else if (b.length === 1) f.push([a[i], a[j], b[0]]);
    else f.push([a[i], a[j], b[j], b[i]]);
  }
  if (caps && a.length > 1) f.push([...a]);
  if (caps && b.length > 1) f.push([...b]);
  return orient(mesh(v, f));
}

/** A low-poly hemisphere (or full sphere) of radius r centred on the origin. */
export function dome(n: number, r: number, stacks = 4, full = false): Mesh {
  const v: V3[] = [], f: number[][] = [], rings: number[][] = [];
  const from = full ? -stacks : 0;
  for (let s = from; s <= stacks; s++) {
    const phi = (s / stacks) * (Math.PI / 2);
    const y = Math.sin(phi) * r, rr = Math.cos(phi) * r;
    const start = v.length;
    if (Math.abs(s) === stacks) {
      v.push([0, y, 0]);
      rings.push([start]);
    } else {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        v.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
      }
      rings.push(Array.from({ length: n }, (_, i) => start + i));
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k], b = rings[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (a.length === 1) f.push([a[0], b[i], b[j]]);
      else if (b.length === 1) f.push([a[i], a[j], b[0]]);
      else f.push([a[i], a[j], b[j], b[i]]);
    }
  }
  if (!full) f.push([...rings[0]]);
  return orient(mesh(v, f));
}

/** A flat rectangle in the XY plane (use with `ds`). */
export function sheet(w: number, h: number): Mesh {
  const x = w / 2, y = h / 2;
  return mesh([[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0]], [[0, 1, 2, 3]]);
}

/** Extrude a counter-clockwise 2D outline (in XY) to a solid of depth d. */
export function extrude(poly: [number, number][], d: number): Mesh {
  const n = poly.length, z = d / 2;
  const v: V3[] = [...poly.map(([x, y]): V3 => [x, y, z]), ...poly.map(([x, y]): V3 => [x, y, -z])];
  const f: number[][] = [poly.map((_, i) => i), poly.map((_, i) => n + (n - 1 - i))];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    f.push([i, n + i, n + j, j]);
  }
  return mesh(v, f);
}

export function polyline(points: V3[], closed = false): Mesh {
  const idx = points.map((_, i) => i);
  if (closed) idx.push(0);
  return mesh(points, [], [idx]);
}

/** A circle of radius r lying flat (XZ plane). */
export function ring(r: number, n = 56): Mesh {
  return polyline(
    Array.from({ length: n }, (_, i): V3 => {
      const a = (i / n) * Math.PI * 2;
      return [Math.cos(a) * r, 0, Math.sin(a) * r];
    }),
    true,
  );
}

/** Latitude / longitude wireframe. */
export function wireSphere(r: number, lat = 7, lon = 12, seg = 36): Mesh {
  const v: V3[] = [], l: number[][] = [];
  for (let i = 1; i < lat; i++) {
    const phi = -Math.PI / 2 + (i / lat) * Math.PI;
    const line: number[] = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      line.push(v.push([Math.cos(a) * Math.cos(phi) * r, Math.sin(phi) * r, Math.sin(a) * Math.cos(phi) * r]) - 1);
    }
    l.push(line);
  }
  for (let i = 0; i < lon; i++) {
    const a = (i / lon) * Math.PI * 2;
    const line: number[] = [];
    for (let k = 0; k <= seg / 2; k++) {
      const phi = -Math.PI / 2 + (k / (seg / 2)) * Math.PI;
      line.push(v.push([Math.cos(a) * Math.cos(phi) * r, Math.sin(phi) * r, Math.sin(a) * Math.cos(phi) * r]) - 1);
    }
    l.push(line);
  }
  return mesh(v, [], l);
}

/** Combine meshes into one, each optionally moved and rotated first. */
export function merge(...parts: [Mesh, V3?, V3?][]): Mesh {
  const out = mesh([]);
  for (const [m, at = [0, 0, 0], rot] of parts) {
    const base = out.v.length;
    const r = rot ? euler(rot[0], rot[1], rot[2]) : null;
    for (const p of m.v) {
      const q = r ? apply(r, p) : p;
      out.v.push([q[0] + at[0], q[1] + at[1], q[2] + at[2]]);
    }
    for (const face of m.f) out.f.push(face.map((i) => i + base));
    for (const line of m.l) out.l.push(line.map((i) => i + base));
  }
  return out;
}

/** Deterministic random numbers, so a scene looks the same on every visit. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function item(part: Partial<Item> & { color: number }): Item {
  return { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, alpha: 1, ...part };
}

// ───────────────────────────── rendering ─────────────────────────────

interface Prim {
  z: number;
  kind: number; // 0 face, 1 line, 2 point, 3 glyph
  xy: number[];
  color: number;
  shade: number;
  alpha: number;
  size: number;
  text: string;
}

const pool: Prim[] = [];
const LIGHT: V3 = [-0.47, 0.74, -0.48];

export function render(ctx: CanvasRenderingContext2D, scene: Scene, t: number, view: View) {
  ctx.clearRect(0, 0, view.w, view.h);
  if (view.alpha <= 0.01) return;
  const yaw = scene.sway ? Math.sin(t * 0.35) * scene.sway : scene.spin * t;
  const cam = euler(scene.tilt + view.py * 0.14, yaw + view.px * 0.3, 0);
  const unit = view.unit * (scene.zoom ?? 1);
  let count = 0;
  const prim = (): Prim => (pool[count] ??= { z: 0, kind: 0, xy: [], color: 0, shade: 0, alpha: 1, size: 1, text: "" });
  const fog = (depth: number) => Math.max(0.12, Math.min(1, 1.2 - (depth - CAM + 1.6) / 5.2));

  for (const it of scene.items) {
    it.tick?.(it, t);
    const m = euler(it.rot[0], it.rot[1], it.rot[2]);
    const sx = it.scale * (it.stretch?.[0] ?? 1), sy = it.scale * (it.stretch?.[1] ?? 1), sz = it.scale * (it.stretch?.[2] ?? 1);
    const toCam = (p: V3): V3 => {
      const q = apply(m, [p[0] * sx, p[1] * sy, p[2] * sz]);
      return apply(cam, [q[0] + it.pos[0], q[1] + it.pos[1], q[2] + it.pos[2]]);
    };
    const project = (p: V3, out: number[]) => {
      const s = CAM / Math.max(0.4, p[2] + CAM);
      out.push(view.cx + p[0] * s * unit, view.cy - p[1] * s * unit);
    };

    if (it.mesh) {
      const pts = it.mesh.v.map(toCam);
      for (const face of it.mesh.f) {
        const fp = face.map((i) => pts[i]);
        const c = centroid(fp);
        const n = newell(fp);
        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        const facing = (n[0] * -c[0] + n[1] * -c[1] + n[2] * (-CAM - c[2])) / len;
        if (!it.ds && facing <= 0) continue;
        const sign = facing < 0 ? -1 : 1;
        const p = prim();
        count++;
        p.kind = 0;
        p.z = c[2];
        p.xy.length = 0;
        for (const q of fp) project(q, p.xy);
        p.color = it.color;
        p.shade = Math.max(0, (dot(n, LIGHT) / len) * sign) * 0.85 + 0.15;
        p.alpha = it.alpha * fog(c[2] + CAM);
      }
      for (const line of it.mesh.l) {
        for (let k = 0; k < line.length - 1; k++) {
          const a = pts[line[k]], b = pts[line[k + 1]];
          const p = prim();
          count++;
          p.kind = 1;
          p.z = (a[2] + b[2]) / 2 - 0.02;
          p.xy.length = 0;
          project(a, p.xy);
          project(b, p.xy);
          p.color = it.line ?? INK;
          p.alpha = it.alpha * fog(p.z + CAM);
          p.size = it.size ?? 1;
        }
      }
    }
    if (it.pts) {
      for (const raw of it.pts) {
        const q = toCam(raw);
        const p = prim();
        count++;
        p.kind = 2;
        p.z = q[2];
        p.xy.length = 0;
        project(q, p.xy);
        p.color = it.color;
        p.alpha = it.alpha * fog(q[2] + CAM);
        p.size = ((it.size ?? 2) * CAM) / Math.max(0.4, q[2] + CAM);
      }
    }
    if (it.glyph) {
      const q = toCam([0, 0, 0]);
      const p = prim();
      count++;
      p.kind = 3;
      p.z = q[2];
      p.xy.length = 0;
      project(q, p.xy);
      p.color = it.color;
      p.alpha = it.alpha * fog(q[2] + CAM);
      p.size = ((it.size ?? 0.3) * it.scale * unit * CAM) / Math.max(0.4, q[2] + CAM);
      p.text = it.glyph;
    }
  }

  const prims = pool.slice(0, count).sort((a, b) => b.z - a.z);
  const pal = view.palette, shadow = pal[7], light = pal[8];
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const p of prims) {
    const base = pal[p.color];
    ctx.globalAlpha = Math.min(1, p.alpha * view.alpha);
    if (p.kind === 0) {
      const s = p.shade;
      const r = (base[0] * 0.6 + shadow[0] * 0.4) * (1 - s) + (base[0] * 0.68 + light[0] * 0.32) * s;
      const g = (base[1] * 0.6 + shadow[1] * 0.4) * (1 - s) + (base[1] * 0.68 + light[1] * 0.32) * s;
      const b = (base[2] * 0.6 + shadow[2] * 0.4) * (1 - s) + (base[2] * 0.68 + light[2] * 0.32) * s;
      ctx.fillStyle = ctx.strokeStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.beginPath();
      ctx.moveTo(p.xy[0], p.xy[1]);
      for (let i = 2; i < p.xy.length; i += 2) ctx.lineTo(p.xy[i], p.xy[i + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.7;
      ctx.stroke();
    } else if (p.kind === 1) {
      ctx.strokeStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.xy[0], p.xy[1]);
      ctx.lineTo(p.xy[2], p.xy[3]);
      ctx.stroke();
    } else if (p.kind === 2) {
      ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      ctx.beginPath();
      ctx.arc(p.xy[0], p.xy[1], Math.max(0.6, p.size), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = ctx.strokeStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      ctx.font = `600 ${p.size}px ${view.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.text, p.xy[0], p.xy[1] + p.size * 0.04);
      ctx.lineWidth = Math.max(1, p.size * 0.06);
      ctx.beginPath();
      ctx.arc(p.xy[0], p.xy[1], p.size * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
