/**
 * The stars behind every page: a field with real depth, and the occasional glint.
 * One function draws a frame; the Backdrop decides the colours (each page is its
 * own world) and how fast we are "travelling". The nebula light itself is CSS
 * (body::before in design.css, fed by --world-1…3): large soft gradients cost a
 * canvas dearly and a browser's compositor almost nothing.
 */
import { seeded } from "./engine";

export interface Sky {
  colors: number[][]; // the world's three colours, rgb (a few stars take them)
  star: number[]; // star colour, rgb
  dark: boolean;
  px: number; // pointer, -1..1
  py: number;
  alpha: number;
  warp: number; // 0 at rest … 1 when travelling between pages: stars stretch into streaks
  lite?: boolean; // a struggling device draws every other star
}

/** A soft round glow, drawn once per colour and reused (far cheaper than a gradient per frame). */
const sprites = new Map<string, HTMLCanvasElement>();
function glow(rgb: number[]): HTMLCanvasElement {
  const key = rgb.map((v) => v | 0).join(",");
  let sprite = sprites.get(key);
  if (!sprite) {
    if (sprites.size > 60) sprites.clear();
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = 256;
    const g = sprite.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, `rgba(${key},1)`);
    grad.addColorStop(0.3, `rgba(${key},0.5)`);
    grad.addColorStop(0.65, `rgba(${key},0.12)`);
    grad.addColorStop(1, `rgba(${key},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    sprites.set(key, sprite);
  }
  return sprite;
}

const rnd = seeded(2026);
const STARS = Array.from({ length: 1100 }, () => {
  const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return { x: s * Math.cos(a), y: u, z: s * Math.sin(a), size: 0.55 + Math.pow(rnd(), 3) * 1.7, phase: rnd() * 6.28, speed: 0.5 + rnd() * 1.7, tint: rnd() };
});
const GLINTS = [3, 41, 97, 150, 211, 283, 340, 402, 467, 520, 610, 705, 790, 880, 960, 1040];

export function drawCosmos(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, sky: Sky) {
  if (sky.alpha <= 0.01) return;
  const big = Math.max(w, h);
  ctx.globalCompositeOperation = sky.dark ? "lighter" : "source-over";

  // Stars sit on a sphere around the viewer; the sphere turns slowly and leans with the pointer.
  const yaw = t * 0.012 + sky.px * 0.07, pitch = -0.18 + sky.py * 0.05;
  const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cx = w / 2, cy = h / 2, f = big * 0.62;
  const base = sky.alpha * (sky.dark ? 1 : 0.7);
  ctx.lineCap = "round";
  for (let i = 0; i < STARS.length; i += sky.lite ? 2 : 1) {
    const s = STARS[i];
    const x1 = s.x * cyaw + s.z * syaw, z1 = -s.x * syaw + s.z * cyaw;
    const y2 = s.y * cp - z1 * sp, z2 = s.y * sp + z1 * cp;
    if (z2 < 0.14) continue;
    const sx = cx + (x1 / z2) * f, sy = cy - (y2 / z2) * f;
    if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
    const twinkle = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
    const c = s.tint > 0.84 ? sky.colors[(i % 3)] : sky.star;
    ctx.globalAlpha = Math.min(1, base * twinkle * (0.5 + s.size * 0.35));
    if (sky.warp > 0.02) {
      // travelling: each star draws a streak away from the centre of the view
      const k = 1 + sky.warp * (0.18 + s.size * 0.16);
      ctx.strokeStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      ctx.lineWidth = s.size * (1 + sky.warp * 0.6);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(cx + (sx - cx) * k, cy + (sy - cy) * k);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Now and then a star catches the light: a four-pointed glint that swells and fades.
  for (let g = 0; g < GLINTS.length; g++) {
    const s = STARS[GLINTS[g]];
    const life = (t * 0.16 + g * 0.31) % 1;
    const swell = Math.pow(Math.max(0, Math.sin(life * Math.PI * 3)), 8);
    if (life > 0.34 || swell < 0.03) continue;
    const x1 = s.x * cyaw + s.z * syaw, z1 = -s.x * syaw + s.z * cyaw;
    const y2 = s.y * cp - z1 * sp, z2 = s.y * sp + z1 * cp;
    if (z2 < 0.14) continue;
    const sx = cx + (x1 / z2) * f, sy = cy - (y2 / z2) * f;
    if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
    const len = 9 + swell * 13, c = sky.star;
    ctx.globalAlpha = Math.min(1, sky.alpha * swell * (sky.dark ? 1 : 0.8));
    ctx.drawImage(glow(c), sx - len, sy - len, len * 2, len * 2);
    ctx.strokeStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - len, sy);
    ctx.lineTo(sx + len, sy);
    ctx.moveTo(sx, sy - len);
    ctx.lineTo(sx, sy + len);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}
