"use client";

import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { PHASES, lunarReport, type LunarReport } from "@/lib/lunar";

/**
 * Tonight's Moon, for the Prelims (lunar) page: the Moon's real phase for the reader's own calendar
 * date, drawn as a lit sphere, with the phase, illumination, age and the next New and Full Moons.
 * The figures come from lib/lunar.ts (Meeus); the picture is rendered here, pixel by pixel, from the
 * same geometry: the Sun's direction (phase angle and the bright limb's position angle), the tilt of
 * the Moon's axis and its libration, over a map of the real maria and craters (scripts/moon-map.py).
 * It is drawn once each time the date changes; nothing animates.
 *
 * Orientation: celestial north up and east to the left, as the Moon looks to the naked eye from
 * India (and the rest of the northern hemisphere) when it is due south.
 */

type MoonMap = { w: number; h: number; px: Uint8ClampedArray };
let mapPromise: Promise<MoonMap | null> | null = null;
function loadMap(small: boolean): Promise<MoonMap | null> {
  mapPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d", { willReadFrequently: true });
      if (!g) return resolve(null);
      g.drawImage(img, 0, 0);
      resolve({ w: c.width, h: c.height, px: g.getImageData(0, 0, c.width, c.height).data });
    };
    img.onerror = () => resolve(null);
    img.src = small ? "/space/moon-map-s.webp" : "/space/moon-map.webp";
  });
  return mapPromise;
}

const RAD = Math.PI / 180;

/** Render the Moon into a canvas: phase angle i, bright-limb position angle chi, axis angle P, libration (°). */
function renderMoon(
  canvas: HTMLCanvasElement,
  map: MoonMap | null,
  g: { i: number; chi: number; P: number; lon: number; lat: number; earthshine: number },
) {
  const N = canvas.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const out = ctx.createImageData(N, N);
  const d = out.data;
  // the Sun, in view space (x right, y up, z towards us): the bright limb's direction on the sky, tipped by the phase angle
  const sc = Math.sin(g.chi * RAD), cc = Math.cos(g.chi * RAD);
  const dx = -sc, dy = cc; // position angle measured from north (up) through east (left)
  const si = Math.sin(g.i * RAD), ci = Math.cos(g.i * RAD);
  const L = [dx * si, dy * si, ci];
  const cP = Math.cos(g.P * RAD), sP = Math.sin(g.P * RAD);
  const cb = Math.cos(g.lat * RAD), sb = Math.sin(g.lat * RAD);
  const R = N / 2 - 1.5;
  const hgt = new Float32Array(N * N), alb = new Float32Array(N * N), inside = new Uint8Array(N * N);
  const sample = (lat: number, lon: number, ch: number) => {
    if (!map) return ch === 0 ? 0.42 : 0.5;
    const u = ((((lon / (2 * Math.PI) + 0.5) % 1) + 1) % 1) * map.w - 0.5;
    const v = (0.5 - lat / Math.PI) * map.h - 0.5;
    const x0 = Math.floor(u), y0 = Math.max(0, Math.min(map.h - 2, Math.floor(v)));
    const fx = u - x0, fy = Math.max(0, Math.min(1, v - y0));
    const at = (x: number, y: number) => map.px[(y * map.w + ((x + map.w) % map.w)) * 4 + ch] / 255;
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  // pass 1: what lies under each pixel (albedo, relief)
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = (px + 0.5 - N / 2) / R, y = (N / 2 - py - 0.5) / R;
      const r2 = x * x + y * y;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2);
      // undo the axis's tilt (lunar north at position angle P), then the libration
      const bx = x * cP - y * sP, by = x * sP + y * cP;
      const y2 = by * cb + z * sb, z2 = -by * sb + z * cb;
      const lat = Math.asin(Math.max(-1, Math.min(1, y2))), lon = Math.atan2(bx, z2) + g.lon * RAD;
      const k = py * N + px;
      alb[k] = sample(lat, lon, 0);
      hgt[k] = sample(lat, lon, 1);
      inside[k] = 1;
    }
  }
  // pass 2: light it. Lommel–Seeliger scattering (the Moon's disc stays bright to the limb at full), relief from the map
  const bump = 0.6 * (N / 300);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const k = py * N + px, o = k * 4;
      const x = (px + 0.5 - N / 2) / R, y = (N / 2 - py - 0.5) / R;
      const r = Math.sqrt(x * x + y * y);
      if (r > 1 + 1.5 / R) continue;
      const cov = Math.max(0, Math.min(1, (1 - r) * R + 0.5));
      let col = 0;
      if (inside[k]) {
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        const gx = inside[k + 1] && inside[k - 1] ? (hgt[k + 1] - hgt[k - 1]) * bump * R : 0;
        const gy = inside[k - N] && inside[k + N] ? (hgt[k - N] - hgt[k + N]) * bump * R : 0;
        let nx = x - gx * 0.02, ny = y - gy * 0.02, nz = z;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        const mu0 = nx * L[0] + ny * L[1] + nz * L[2], mu0s = x * L[0] + y * L[1] + z * L[2];
        const mu = Math.max(0.05, z);
        const day = mu0 > 0 ? (2 * mu0) / (mu0 + mu) : 0;
        const term = Math.max(0, Math.min(1, mu0s * 9 + 0.5)); // the terminator, a few pixels soft
        col = alb[k] * (day * term * 1.05 + g.earthshine); // the night side, lit faintly by sunlight off the Earth
      }
      const s = Math.pow(Math.min(1, col), 1 / 2.2) * 255;
      d[o] = s * 1.0;
      d[o + 1] = s * 0.985;
      d[o + 2] = s * 0.955;
      d[o + 3] = cov * 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

/** "YYYY-MM-DD" for a local date. */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseLocal = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // a chosen day is shown at local noon
};

function Moon({ report, size, small }: { report: LunarReport; size: number; small: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(size * dpr);
    const g = {
      i: report.phaseAngle, chi: report.brightLimb, P: report.axis, lon: report.libration.lon, lat: report.libration.lat,
      // earthshine: sunlight off the Earth on the night side, seen on a young or old crescent; a New Moon is lost in the Sun's glare
      earthshine: 0.009 * (1 - report.illuminated) ** 2 * Math.max(0, Math.min(1, (172 - report.phaseAngle) / 22)),
    };
    renderMoon(canvas, null, g); // the shape at once, the surface when the map arrives
    loadMap(small).then((map) => live && map && renderMoon(canvas, map, g));
    return () => {
      live = false;
    };
  }, [report, size, small]);
  return (
    <canvas
      ref={ref}
      className="moon-canvas"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${report.phase}: ${Math.round(report.illuminated * 100)}% of the Moon's disc lit${report.waxing ? ", waxing" : ", waning"}`}
    />
  );
}

/** The eight principal phases, each drawn with the same renderer: where this date sits in the cycle. */
function PhaseStrip({ report }: { report: LunarReport }) {
  const current = PHASES.indexOf(report.phase);
  return (
    <ol className="moon-strip" aria-label="The eight phases of the Moon">
      {PHASES.map((name, k) => (
        <li key={name} aria-current={k === current ? "true" : undefined} title={name}>
          <MiniMoon k={k} />
          <span>{name.replace(" Moon", "").replace("Waxing ", "Wax. ").replace("Waning ", "Wan. ")}</span>
        </li>
      ))}
    </ol>
  );
}
function MiniMoon({ k }: { k: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(30 * dpr);
    const elong = k * 45; // 0 New … 180 Full … 315 the waning crescent
    // waxing: lit on the right (west); waning: on the left
    const g = { i: Math.abs(180 - elong), chi: elong < 180 ? 270 : 90, P: 0, lon: 0, lat: 0, earthshine: k === 1 || k === 7 ? 0.02 : 0 };
    renderMoon(canvas, null, g);
    loadMap(true).then((map) => map && renderMoon(canvas, map, g));
  }, [k]);
  return <canvas ref={ref} className="moon-mini" style={{ width: 30, height: 30 }} aria-hidden />;
}

/** The reader's calendar day, as a store: it changes at local midnight (and is re-read on returning to the tab). */
function subscribeDay(onChange: () => void) {
  let timer = 0;
  const arm = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    timer = window.setTimeout(() => {
      onChange();
      arm();
    }, midnight.getTime() - now.getTime());
  };
  arm();
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}
const subscribeWidth = (onChange: () => void) => {
  const mq = matchMedia("(max-width: 639px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

export function MoonPhase() {
  // known only in the browser: the reader's own calendar, not the server's
  const today = useSyncExternalStore(subscribeDay, () => iso(new Date()), () => "");
  const narrow = useSyncExternalStore(subscribeWidth, () => matchMedia("(max-width: 639px)").matches, () => false);
  const [picked, setPicked] = useState<string | null>(null); // null = today, live

  const day = picked ?? today;
  const report = useMemo(() => {
    if (!day) return null;
    const isToday = day === today;
    const noon = parseLocal(day);
    const start = new Date(noon.getFullYear(), noon.getMonth(), noon.getDate(), 0, 0, 0);
    const end = new Date(noon.getFullYear(), noon.getMonth(), noon.getDate() + 1, 0, 0, 0);
    // today: this very moment; another day: its local noon
    return lunarReport(isToday ? new Date() : noon, start, end);
  }, [day, today]);

  const step = useCallback((days: number) => {
    const base = parseLocal(picked ?? today);
    base.setDate(base.getDate() + days);
    const s = iso(base);
    setPicked(s === today ? null : s);
  }, [picked, today]);

  if (!report) return <section className="moon-card moon-card-empty" aria-label="The Moon's phase" />;

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const whenFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  const daysTo = (t: Date) => (t.getTime() - report.at.getTime()) / 86400000;
  const isToday = day === today;
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

  return (
    <section className="moon-card" aria-labelledby="moon-h">
      <div className="moon-view">
        <Moon report={report} size={narrow ? 104 : 168} small={narrow} />
      </div>
      <div className="moon-info">
        <div className="moon-top">
          <div>
            <p className="moon-kicker">{isToday ? "Tonight's Moon" : "The Moon on"}</p>
            <h2 id="moon-h" className="moon-name" aria-live="polite">
              {report.phase}
            </h2>
            <p className="moon-date">
              {dateFmt.format(parseLocal(day))}
              {report.exact ? ` · exact at ${timeFmt.format(report.exact)}` : isToday ? ` · now, ${timeFmt.format(report.at)}` : " · at local noon"}
            </p>
          </div>
          <div className="moon-pick">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => step(-1)} aria-label="Previous day">
              <ChevronLeft size={16} aria-hidden />
            </button>
            <label className="moon-date-input">
              <CalendarDays size={15} aria-hidden />
              <span className="sr-only">Choose a date</span>
              <input
                type="date"
                value={day}
                min="1900-01-01"
                max="2100-12-31"
                onChange={(e) => e.target.value && setPicked(e.target.value === today ? null : e.target.value)}
              />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => step(1)} aria-label="Next day">
              <ChevronRight size={16} aria-hidden />
            </button>
            {!isToday && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicked(null)}>
                <RotateCcw size={14} aria-hidden /> Today
              </button>
            )}
          </div>
        </div>
        <dl className="moon-facts">
          <div>
            <dt>Illuminated</dt>
            <dd>{(report.illuminated * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Lunar age</dt>
            <dd>{report.age.toFixed(1)} days</dd>
          </div>
          <div>
            <dt>Next Full Moon</dt>
            <dd>
              in {daysTo(report.nextFull).toFixed(1)} days
              <small>{whenFmt.format(report.nextFull)}</small>
            </dd>
          </div>
          <div>
            <dt>Next New Moon</dt>
            <dd>
              in {daysTo(report.nextNew).toFixed(1)} days
              <small>{whenFmt.format(report.nextNew)}</small>
            </dd>
          </div>
          <div className="moon-extra">
            <dt>Distance</dt>
            <dd>{Math.round(report.distance).toLocaleString()} km</dd>
          </div>
        </dl>
        <PhaseStrip report={report} />
        <p className="moon-note">
          Computed for your time zone ({zone}) from the positions of the Sun and Moon (Meeus, <i>Astronomical Algorithms</i>).
          This lunation lasts {report.lunation.toFixed(2)} days. North is up, as seen with the naked eye from the northern hemisphere.
        </p>
      </div>
    </section>
  );
}
