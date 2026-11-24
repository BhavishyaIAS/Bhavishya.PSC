/**
 * The Sky style's round portals: each way in (an exam, a module) is a disc of night space with something
 * moving inside it. Drawn on a 2D canvas; SkyBackdrop animates every `canvas[data-sky]` on the page.
 */
export type PortalKind = "galaxy" | "blackhole" | "whitehole" | "wormhole" | "waves" | "spark";

const TAU = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);
type Ctx = CanvasRenderingContext2D;

const KIND: Record<PortalKind, (x: Ctx, c: number, R: number, u: number, t: number) => void> = {
  galaxy: (x, c, R, u, t) => galaxy(x, c, R, u, t, 1),
  spark: (x, c, R, u, t) => galaxy(x, c, R, u, t, 0.8),
  blackhole(x, c, R, u, t) {
    const streaks = () => {
      for (let k = 0; k < 46; k++) {
        const f = k / 46, rr = R * (0.42 + 0.56 * f), st = t * (1.7 - f) + k * 1.71;
        x.strokeStyle = `hsla(${44 - f * 34},100%,${68 - f * 16}%,${0.7 - f * 0.35})`;
        x.lineWidth = 1.2 * u;
        x.beginPath();
        x.ellipse(c, c, rr, rr * 0.27, -0.18, st, st + 1.25);
        x.stroke();
      }
    };
    streaks();
    x.strokeStyle = "rgba(255,214,150,.8)";
    x.lineWidth = 1.6 * u;
    x.shadowColor = "#ffb44a";
    x.shadowBlur = 10 * u;
    x.beginPath();
    x.arc(c, c, R * 0.34, 0, TAU);
    x.stroke();
    x.shadowBlur = 0;
    x.fillStyle = "#000";
    x.beginPath();
    x.arc(c, c, R * 0.31, 0, TAU);
    x.fill();
    x.save();
    x.beginPath();
    x.rect(0, c + R * 0.02, c * 2, c);
    x.clip();
    streaks();
    x.restore();
  },
  whitehole(x, c, R, u, t) {
    const g = x.createRadialGradient(c, c, 0, c, c, R * 0.62);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.25, "rgba(190,240,255,.95)");
    g.addColorStop(0.6, "rgba(110,170,255,.35)");
    g.addColorStop(1, "rgba(110,170,255,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(c, c, R * 0.62, 0, TAU);
    x.fill();
    x.lineCap = "round";
    for (let i = 0; i < 44; i++) {
      const a = i * 2.399, p = frac(t * 0.33 + i * 0.137), r = R * (0.18 + 0.82 * p), l = R * 0.13 * (1 - p * 0.6);
      x.strokeStyle = `rgba(${220 - p * 60},${245 - p * 30},255,${1 - p})`;
      x.lineWidth = (1.7 - p) * u;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      x.lineTo(c + Math.cos(a) * (r + l), c + Math.sin(a) * (r + l));
      x.stroke();
    }
  },
  wormhole(x, c, R, u, t) {
    const ox = Math.sin(t * 0.55) * R * 0.16, oy = Math.cos(t * 0.4) * R * 0.12;
    for (let k = 0; k < 11; k++) {
      const p = frac(k / 11 + t * 0.11), e = Math.pow(1 - p, 1.7), r = R * (0.06 + 0.94 * e);
      x.strokeStyle = `hsla(${185 + p * 95},92%,66%,${0.2 + 0.7 * e})`;
      x.lineWidth = (0.5 + 2.6 * e) * u;
      x.beginPath();
      x.arc(c + ox * p, c + oy * p, r, 0, TAU);
      x.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12 + t * 0.2;
      x.strokeStyle = "rgba(150,210,255,.13)";
      x.lineWidth = 0.8 * u;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
      x.quadraticCurveTo(c + Math.cos(a + 0.9) * R * 0.4, c + Math.sin(a + 0.9) * R * 0.4, c + ox, c + oy);
      x.stroke();
    }
    const g = x.createRadialGradient(c, c, 0, c, c, R * 0.16);
    g.addColorStop(0, "rgba(255,255,255,.95)");
    g.addColorStop(1, "rgba(160,120,255,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(c + ox, c + oy, R * 0.16, 0, TAU);
    x.fill();
  },
  waves(x, c, R, u, t) {
    x.lineCap = "round";
    for (let arm = 0; arm < 2; arm++) {
      for (let s = 0; s < 90; s++) {
        const th = (s / 90) * TAU * 3, th2 = ((s + 1) / 90) * TAU * 3, f = s / 90;
        const r1 = R * (0.13 + 0.84 * f), r2 = R * (0.13 + (0.84 * (s + 1)) / 90);
        const a1 = th - t * 2.2 + arm * Math.PI, a2 = th2 - t * 2.2 + arm * Math.PI;
        x.strokeStyle = `hsla(${300 - f * 120},90%,70%,${0.95 - f * 0.8})`;
        x.lineWidth = (2.4 - f * 1.4) * u;
        x.beginPath();
        x.moveTo(c + Math.cos(a1) * r1, c + Math.sin(a1) * r1);
        x.lineTo(c + Math.cos(a2) * r2, c + Math.sin(a2) * r2);
        x.stroke();
      }
    }
    for (let b = 0; b < 2; b++) {
      const a = -t * 2.2 + b * Math.PI + 0.2;
      x.fillStyle = "#fff";
      x.shadowColor = "#c9a2ff";
      x.shadowBlur = 8 * u;
      x.beginPath();
      x.arc(c + Math.cos(a) * R * 0.11, c + Math.sin(a) * R * 0.11, 2.6 * u, 0, TAU);
      x.fill();
    }
    x.shadowBlur = 0;
  },
};

function galaxy(x: Ctx, c: number, R: number, u: number, t: number, k: number) {
  const n = 150;
  for (let i = 0; i < n; i++) {
    const f = i / n, r = f * R * 0.92 * k, a = ((i % 3) * TAU) / 3 + f * 5.2 + t * 0.35 + Math.sin(i * 12.99) * 0.18;
    x.fillStyle = `hsla(${40 + f * 170},95%,${82 - f * 18}%,${0.95 - f * 0.5})`;
    x.beginPath();
    x.arc(c + Math.cos(a) * r, c + Math.sin(a) * r * 0.62, (0.55 + (1 - f) * 1.5) * u * k, 0, TAU);
    x.fill();
  }
  const g = x.createRadialGradient(c, c, 0, c, c, R * 0.3 * k);
  g.addColorStop(0, "rgba(255,240,200,.95)");
  g.addColorStop(1, "rgba(255,200,120,0)");
  x.fillStyle = g;
  x.beginPath();
  x.arc(c, c, R * 0.3 * k, 0, TAU);
  x.fill();
}

export function drawPortal(cvs: HTMLCanvasElement, t: number) {
  const css = cvs.clientWidth || Number(cvs.getAttribute("width"));
  const d = Math.min(window.devicePixelRatio || 1, 2), s = Math.round(css * d);
  if (!s) return;
  if (cvs.width !== s) {
    cvs.width = s;
    cvs.height = s;
  }
  const x = cvs.getContext("2d");
  const type = cvs.dataset.sky as PortalKind;
  if (!x || !(type in KIND)) return;
  const c = s / 2, R = s * 0.44, u = s / 120;
  x.clearRect(0, 0, s, s);
  x.shadowBlur = 0;
  const g = x.createRadialGradient(c, c, 0, c, c, R);
  g.addColorStop(0, "#1d1250");
  g.addColorStop(1, "#04020d");
  x.fillStyle = g;
  x.beginPath();
  x.arc(c, c, R, 0, TAU);
  x.fill();
  x.save();
  x.beginPath();
  x.arc(c, c, R, 0, TAU);
  x.clip();
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4, r = R * frac(i * 0.618 + 0.2);
    x.fillStyle = `rgba(255,255,255,${0.25 + 0.3 * Math.sin(t * 1.5 + i)})`;
    x.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, u, u);
  }
  KIND[type](x, c, R, u, t);
  x.restore();
  if (type === "spark") {
    x.lineCap = "round";
    for (let i = 0; i < 110; i++) {
      const a = (i * TAU) / 110 + t * 1.6 + Math.sin(i * 7.1) * 0.05, j = Math.sin(i * 3.7 + t * 6) * R * 0.05;
      const r = R * 0.98 + j, l = 0.1 + 0.14 * frac(i * 0.37 + t);
      x.strokeStyle = `hsla(${24 + frac(i * 0.21) * 26},100%,${58 + frac(i * 0.53) * 26}%,${0.45 + 0.5 * frac(i * 0.77 + t * 2)})`;
      x.lineWidth = (0.8 + frac(i * 0.9) * 1.4) * u;
      x.beginPath();
      x.arc(c, c, r, a, a + l);
      x.stroke();
    }
  } else {
    let rim: string | CanvasGradient = "#ffc66b";
    if (x.createConicGradient) {
      rim = x.createConicGradient(t * 0.5, c, c);
      rim.addColorStop(0, "#ffc66b");
      rim.addColorStop(0.33, "#d06bff");
      rim.addColorStop(0.66, "#6fe3ff");
      rim.addColorStop(1, "#ffc66b");
    }
    x.strokeStyle = rim;
    x.lineWidth = 2.4 * u;
    x.shadowColor = "rgba(160,120,255,.8)";
    x.shadowBlur = 7 * u;
    x.beginPath();
    x.arc(c, c, R, 0, TAU);
    x.stroke();
    x.shadowBlur = 0;
  }
}

/** Which portal each module and each exam opens through. */
export const MODULE_PORTALS: Record<string, { kind: PortalKind; name: string }> = {
  syllabus: { kind: "galaxy", name: "Galaxy" },
  materials: { kind: "whitehole", name: "White hole" },
  prelims: { kind: "wormhole", name: "Wormhole" },
  mains: { kind: "blackhole", name: "Black hole" },
  progress: { kind: "waves", name: "Gravitational waves" },
};

export function examPortal(slug: string, index: number): PortalKind {
  if (slug === "upsc") return "wormhole";
  if (slug === "appsc") return "spark";
  return (["galaxy", "whitehole", "blackhole", "waves"] as PortalKind[])[index % 4];
}

/** The four ways into an exam, in order: the home of an exam shows them as big blocks, every page inside as pills. */
export const MODULES: { tab: string; name: string; short: string; kind: PortalKind; portal: string; blurb: string }[] = [
  { tab: "materials", name: "Material / Notes", short: "Notes", kind: "whitehole", portal: "White hole", blurb: "Every subject, opened topic by topic, as the syllabus has it." },
  { tab: "prelims", name: "Prelims PYQ Vault", short: "Prelims PYQs", kind: "wormhole", portal: "Wormhole", blurb: "Past Prelims questions, by year, paper or subject." },
  { tab: "mains", name: "Mains PYQ Vault", short: "Mains PYQs", kind: "blackhole", portal: "Black hole", blurb: "Past Mains questions, with model answers." },
  { tab: "progress", name: "Progress Tracker", short: "Progress", kind: "waves", portal: "Gravitational waves", blurb: "How much of the syllabus you have covered." },
];

/* ─── which portals are on screen: each registers itself when it appears (SkyPortal); PortalMotion draws them ─── */
export const visiblePortals = new Set<HTMLCanvasElement>();
let io: IntersectionObserver | null = null;

export function registerPortal(c: HTMLCanvasElement): () => void {
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const el = e.target as HTMLCanvasElement;
      if (e.isIntersecting) visiblePortals.add(el);
      else visiblePortals.delete(el);
    }
  });
  io.observe(c);
  drawPortal(c, 1.3); // a first frame at once, so a portal is never blank
  return () => {
    io?.unobserve(c);
    visiblePortals.delete(c);
  };
}
