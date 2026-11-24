"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { PHASES, lunarReport, moonState, type MoonState, type PhaseName } from "@/lib/lunar";

/**
 * Tonight's Moon, for the Prelims (lunar) page: the Moon's real phase for the reader's own calendar
 * date, drawn as a lit sphere, with the phase, illumination, age and the next New and Full Moons.
 * The figures come from lib/lunar.ts (Meeus); the picture is rendered here, pixel by pixel, from the
 * same geometry: the Sun's direction (phase angle and the bright limb's position angle), the tilt of
 * the Moon's axis and its libration, over a map of the real maria and craters (scripts/moon-map.py).
 * It is alive without being busy: today's card ticks (the countdowns by the second, the Moon itself
 * recomputed every minute); changing the date sweeps the terminator through the days between; "Play the
 * month" runs a whole lunation from the real positions (libration's slow rocking included) and the
 * slider scrubs through it. Frames are drawn only while something moves; with reduced motion, changes
 * are instant.
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
const DAY = 86400000;
const PLAY_SECONDS = 12; // one lunation, played
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** What the renderer needs from the Moon's state. */
const geometry = (s: MoonState) => ({
  i: s.phaseAngle, chi: s.brightLimb, P: s.axis, lon: s.libration.lon, lat: s.libration.lat,
  // earthshine: sunlight off the Earth on the night side, seen on a young or old crescent; a New Moon is lost in the Sun's glare
  earthshine: 0.0055 * (1 - s.illuminated) ** 2 * clamp01((172 - s.phaseAngle) / 22),
});
/** A phase name from the elongation alone, for moments between whole days (principal within ±12 hours). */
function phaseOf(elong: number): PhaseName {
  for (let k = 0; k < 4; k++) {
    const d = ((elong - k * 90 + 540) % 360) - 180;
    if (Math.abs(d) < 6.1) return PHASES[k * 2];
  }
  return PHASES[elong < 90 ? 1 : elong < 180 ? 3 : elong < 270 ? 5 : 7];
}
/** "2d 03h 12m 08s" */
function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d}d ${p(h)}h ${p(m)}m ${p(sec)}s`;
}

/** The eight principal phases, each drawn with the same renderer: where this moment sits in the cycle. */
function PhaseStrip({ current }: { current: number }) {
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
/** A clock that ticks once a second (for the live countdowns). */
const subscribeSecond = (onChange: () => void) => {
  const t = window.setInterval(onChange, 1000);
  return () => window.clearInterval(t);
};
const subscribeWidth = (onChange: () => void) => {
  const mq = matchMedia("(max-width: 639px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
/** Reduced motion: the system setting, or "Animations: off" in the footer. */
const subscribeMotion = (onChange: () => void) => {
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    mq.removeEventListener("change", onChange);
    mo.disconnect();
  };
};
const stillNow = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";

export function MoonPhase() {
  // known only in the browser: the reader's own calendar and clock, not the server's
  const today = useSyncExternalStore(subscribeDay, () => iso(new Date()), () => "");
  const second = useSyncExternalStore(subscribeSecond, () => Math.floor(Date.now() / 1000), () => 0);
  const narrow = useSyncExternalStore(subscribeWidth, () => matchMedia("(max-width: 639px)").matches, () => false);
  const still = useSyncExternalStore(subscribeMotion, stillNow, () => true);
  const [picked, setPicked] = useState<string | null>(null); // null = today, live
  const [sim, setSim] = useState<number | null>(null); // a moment being played or scrubbed to (ms), else null
  const [playing, setPlaying] = useState(false);
  const size = narrow ? 104 : 168;

  const day = picked ?? today;
  const isToday = day === today;
  const minute = isToday ? Math.floor(second / 60) : 0; // today, the figures are recomputed each minute
  const report = useMemo(() => {
    if (!day) return null;
    const noon = parseLocal(day);
    const start = new Date(noon.getFullYear(), noon.getMonth(), noon.getDate(), 0, 0, 0);
    const end = new Date(noon.getFullYear(), noon.getMonth(), noon.getDate() + 1, 0, 0, 0);
    // today: this very minute; another day: its local noon
    return lunarReport(minute ? new Date(minute * 60000) : noon, start, end);
  }, [day, minute]);

  // a moment that is played or scrubbed to: exact figures once it holds still, quick ones while it moves
  const held = useMemo(() => {
    if (sim === null || playing) return null;
    const t = new Date(sim);
    return lunarReport(t, new Date(t.getFullYear(), t.getMonth(), t.getDate()), new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
  }, [sim, playing]);
  const quick = useMemo(() => (sim !== null && playing ? moonState(new Date(sim)) : null), [sim, playing]);

  // ── the picture: drawn only when something changes, in motion only while it moves ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<Awaited<ReturnType<typeof loadMap>>>(null);
  const shownRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const draw = useCallback(
    (t: number, hi: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const n = Math.round(size * (hi ? dpr : Math.min(dpr, 1.25)));
      if (canvas.width !== n) canvas.width = canvas.height = n;
      renderMoon(canvas, mapRef.current, geometry(moonState(new Date(t))));
      shownRef.current = t;
    },
    [size],
  );
  useEffect(() => {
    let live = true;
    loadMap(narrow).then((map) => {
      if (!live) return;
      mapRef.current = map;
      if (shownRef.current !== null) draw(shownRef.current, true);
    });
    return () => {
      live = false;
    };
  }, [narrow, draw]);

  // the date (or minute) changed: sweep the terminator through the time between
  const target = sim ?? report?.at.getTime() ?? null;
  useEffect(() => {
    if (target === null || playing) return;
    cancelAnimationFrame(frameRef.current);
    const from = shownRef.current;
    const gap = from === null ? 0 : target - from;
    if (from === null || still || Math.abs(gap) < 3600000 || sim !== null) {
      draw(target, true);
      return;
    }
    // far jumps: arrive with a short sweep rather than spinning through months
    const start = Math.abs(gap) > 31 * DAY ? target - Math.sign(gap) * 4 * DAY : from;
    const span = target - start;
    const dur = Math.min(1600, Math.max(420, (Math.abs(span) / DAY) * 140));
    const t0 = performance.now();
    const step = (now: number) => {
      const k = clamp01((now - t0) / dur);
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      if (k < 1) {
        draw(start + span * e, false);
        frameRef.current = requestAnimationFrame(step);
      } else draw(target, true);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, playing, still, sim, draw]);

  // "Play the month": a whole lunation in PLAY_SECONDS, from the real positions, until paused
  useEffect(() => {
    if (!playing) return;
    let t = shownRef.current ?? Date.now();
    let last = performance.now(), told = 0;
    const rate = (29.530588 * DAY) / (PLAY_SECONDS * 1000); // simulated ms per real ms
    const step = (now: number) => {
      t += Math.min(80, now - last) * rate;
      last = now;
      draw(t, false);
      if (now - told > 90) {
        told = now;
        setSim(t);
      }
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameRef.current);
      setSim(t);
      draw(t, true);
    };
  }, [playing, draw]);

  const step = useCallback(
    (days: number) => {
      const base = parseLocal(picked ?? today);
      base.setDate(base.getDate() + days);
      const s = iso(base);
      setPlaying(false);
      setSim(null);
      setPicked(s === today ? null : s);
    },
    [picked, today],
  );

  if (!report) return <section className="moon-card moon-card-empty" aria-label="The Moon's phase" />;

  // what is on show: the chosen day, or a moment being played / scrubbed to
  const view = held ?? report;
  const phase: PhaseName = quick ? phaseOf(quick.elongation) : view.phase;
  const illuminated = quick ? quick.illuminated : view.illuminated;
  const lunation = report.lunation;
  const age = quick ? ((((sim! - report.previousNew.getTime()) / DAY) % lunation) + lunation) % lunation : view.age;
  const live = isToday && sim === null;
  const at = sim ?? view.at.getTime();

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const whenFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  const until = (t: Date) => (live ? countdown(t.getTime() - second * 1000) : `in ${((t.getTime() - at) / DAY).toFixed(1)} days`);

  return (
    <section className="moon-card" aria-labelledby="moon-h">
      <div className={`moon-view ${playing ? "is-playing" : ""}`} style={{ ["--glow" as string]: illuminated.toFixed(3) }}>
        <canvas
          ref={canvasRef}
          className="moon-canvas"
          style={{ width: size, height: size }}
          role="img"
          aria-label={`${phase}: ${Math.round(illuminated * 100)}% of the Moon's disc lit`}
        />
      </div>
      <div className="moon-info">
        <div className="moon-top">
          <div>
            <p className="moon-kicker">
              {live && <span className="moon-live">Live</span>}
              {sim !== null ? (playing ? "Playing the lunar month" : "The Moon at") : isToday ? "Tonight's Moon" : "The Moon on"}
            </p>
            <h2 id="moon-h" className="moon-name" aria-live={playing ? "off" : "polite"}>
              {phase}
            </h2>
            <p className="moon-date">
              {sim !== null
                ? whenFmt.format(new Date(sim))
                : `${dateFmt.format(parseLocal(day))}${view.exact ? ` · exact at ${timeFmt.format(view.exact)}` : isToday ? ` · now, ${timeFmt.format(view.at)}` : " · at local noon"}`}
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
                onChange={(e) => {
                  if (!e.target.value) return;
                  setPlaying(false);
                  setSim(null);
                  setPicked(e.target.value === today ? null : e.target.value);
                }}
              />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => step(1)} aria-label="Next day">
              <ChevronRight size={16} aria-hidden />
            </button>
            {(!isToday || sim !== null) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setPlaying(false);
                  setSim(null);
                  setPicked(null);
                }}
              >
                <RotateCcw size={14} aria-hidden /> Today
              </button>
            )}
          </div>
        </div>
        <dl className="moon-facts">
          <div>
            <dt>Illuminated</dt>
            <dd>{(illuminated * 100).toFixed(live ? 2 : 1)}%</dd>
          </div>
          <div>
            <dt>Lunar age</dt>
            <dd>{age.toFixed(quick ? 1 : 2)} days</dd>
          </div>
          {!quick && (
            <>
              <div>
                <dt>Next Full Moon</dt>
                <dd className={live ? "moon-tick" : undefined}>
                  {until(view.nextFull)}
                  <small>{whenFmt.format(view.nextFull)}</small>
                </dd>
              </div>
              <div>
                <dt>Next New Moon</dt>
                <dd className={live ? "moon-tick" : undefined}>
                  {until(view.nextNew)}
                  <small>{whenFmt.format(view.nextNew)}</small>
                </dd>
              </div>
            </>
          )}
          <div className="moon-extra">
            <dt>Distance</dt>
            <dd>{Math.round((quick ?? view).distance).toLocaleString()} km</dd>
          </div>
        </dl>
        <div className="moon-play">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
            {playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />} {playing ? "Pause" : "Play the month"}
          </button>
          <label className="moon-scrub">
            <span>New</span>
            <input
              type="range"
              min={0}
              max={lunation}
              step={0.05}
              value={Math.min(lunation, age)}
              aria-label="Days into the lunar month"
              aria-valuetext={`${age.toFixed(1)} days: ${phase}`}
              onChange={(e) => {
                setPlaying(false);
                setSim(report.previousNew.getTime() + Number(e.target.value) * DAY);
              }}
            />
            <span>New</span>
          </label>
        </div>
        <PhaseStrip current={PHASES.indexOf(phase)} />
        <p className="moon-note">
          Computed for your time zone ({zone}) from the positions of the Sun and Moon (Meeus, <i>Astronomical Algorithms</i>).
          This lunation lasts {lunation.toFixed(2)} days. North is up, as seen with the naked eye from the northern hemisphere.
        </p>
      </div>
    </section>
  );
}

/** One quiet line for each phase, under its name in the corner. */
const VERSE: Record<PhaseName, string> = {
  "New Moon": "a dark page, waiting to be written",
  "Waxing Crescent": "a thin bow of light, growing",
  "First Quarter": "half the way to fullness",
  "Waxing Gibbous": "almost whole, still gathering",
  "Full Moon": "the whole face, turned to us",
  "Waning Gibbous": "giving back its light, slowly",
  "Last Quarter": "half the way to rest",
  "Waning Crescent": "a last silver thread before the dark",
};

/**
 * Tonight's Moon, small, in the page's top-right corner (the Classic look's Prelims page): the real phase,
 * its name and a line of verse. No controls and nothing ticking; it is redrawn every ten minutes.
 */
export function MoonCorner() {
  const ref = useRef<HTMLCanvasElement>(null);
  const tick = useSyncExternalStore(
    (on) => {
      const t = window.setInterval(on, 600000);
      return () => window.clearInterval(t);
    },
    () => Math.floor(Date.now() / 600000),
    () => 0,
  );
  const state = useMemo(() => (tick ? moonState(new Date(tick * 600000)) : null), [tick]);
  useEffect(() => {
    if (!state) return;
    let live = true;
    loadMap(true).then((map) => {
      const canvas = ref.current;
      if (!live || !canvas) return;
      const n = Math.round(52 * Math.min(2, window.devicePixelRatio || 1));
      canvas.width = canvas.height = n;
      renderMoon(canvas, map, geometry(state));
    });
    return () => {
      live = false;
    };
  }, [state]);
  if (!state) return <aside className="moon-corner" aria-hidden />;
  const phase = phaseOf(state.elongation);
  return (
    <aside className="moon-corner" aria-label={`Tonight's Moon: ${phase}, ${Math.round(state.illuminated * 100)}% lit`}>
      <canvas ref={ref} className="moon-corner-disc" style={{ ["--glow" as string]: state.illuminated.toFixed(2) }} aria-hidden />
      <span className="moon-corner-words" aria-hidden>
        <b>{phase}</b>
        <i>{VERSE[phase]}</i>
      </span>
    </aside>
  );
}
