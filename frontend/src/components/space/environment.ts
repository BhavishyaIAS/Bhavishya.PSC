/**
 * The cosmic environment engine: what the sky looks like, here and now.
 *
 * From the browser's clock and time zone it works out where the Sun and the Moon are in the
 * local sky (altitude and azimuth, low-precision almanac formulas, good to a degree or so), the
 * Moon's phase, where the planets are on their orbits, and from those the colour of the sky, how
 * many stars show, and which ink keeps text on the sky readable. Renderers (Universe.tsx and the
 * CSS fallback) only draw what this decides.
 *
 * Independent controls (ENV below): the Sun, the Moon, the planets' motion, the sky's lighting,
 * celestial events (shooting stars, meteors, comets, satellites) and how often all this updates.
 *
 * This file must stay self-contained (no imports, no outside references): `cosmicEngine` is also
 * stringified into an inline script that sets the sky before the first paint (see layout.tsx).
 */

export interface SkyState {
  /** Sun and Moon: altitude/azimuth in degrees; screen position as fractions of the viewport (x from left, y from top). */
  sun: { alt: number; az: number; x: number; y: number };
  moon: { alt: number; az: number; x: number; y: number; elongation: number; illuminated: number; waxing: boolean };
  /** Sky colours, sRGB 0..1: zenith, horizon, and the light around the Sun. */
  zenith: number[];
  horizon: number[];
  glow: number[];
  /** 0 (full daylight) .. 1 (dark night): how much of the deep sky shows. */
  stars: number;
  /** 0..1 how much sunlight falls on the scene (for lighting the interface). */
  daylight: number;
  /** Which ink reads on the sky, and the even haze laid over the sky so that it does everywhere. */
  ink: "light" | "dark";
  haze: number[];
  hazeAlpha: number;
  /** Fraction of the viewport height where the horizon lies. */
  horizonY: number;
  /** Planets' heliocentric longitudes (radians) at this moment: Mercury … Saturn. */
  planets: number[];
  phase: "night" | "dawn" | "day" | "dusk";
}

export function cosmicEngine() {
  const RAD = Math.PI / 180;
  const ENV = {
    sun: true,
    moon: true,
    planets: true,
    events: true,
    atmosphere: true,
    /** illustrative orbital clock: Earth goes round the Sun once in this many seconds */
    earthYearSeconds: 400,
  };

  // ── where the reader is: from the time zone (no permission needed, no network) ──
  function place() {
    let zone = "";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {
      zone = "";
    }
    if (zone === "Asia/Kolkata" || zone === "Asia/Calcutta") return { lat: 16.5, lon: 80.6 }; // the Telugu states
    const lon = -new Date().getTimezoneOffset() / 4; // a zone's offset is its mean longitude
    const south = /^(Australia|Antarctica)\/|Pacific\/(Auckland|Fiji)|America\/(Sao_Paulo|Argentina|Santiago|Montevideo|Lima)|Africa\/(Johannesburg|Harare|Maputo)|Indian\/(Mauritius|Reunion)/.test(zone);
    return { lat: south ? -30 : 22, lon: lon };
  }

  // ── almanac ──
  function days(ms: number) {
    return ms / 86400000 + 2440587.5 - 2451545.0; // days since J2000.0
  }
  function toEquatorial(lam: number, beta: number, d: number) {
    const e = (23.439 - 0.00000036 * d) * RAD;
    const ra = Math.atan2(Math.cos(e) * Math.sin(lam) - Math.tan(beta) * Math.sin(e), Math.cos(lam));
    const dec = Math.asin(Math.sin(beta) * Math.cos(e) + Math.cos(beta) * Math.sin(e) * Math.sin(lam));
    return { ra: ra, dec: dec };
  }
  function horizontal(ra: number, dec: number, d: number, lat: number, lon: number) {
    const lst = ((280.46061837 + 360.98564736629 * d + lon) % 360) * RAD;
    const H = lst - ra, phi = lat * RAD;
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
    return { alt: alt / RAD, az: ((az / RAD) % 360 + 360) % 360 };
  }
  function sunLongitude(d: number) {
    const g = (357.529 + 0.98560028 * d) * RAD;
    return (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  }
  function moonEcliptic(d: number) {
    const L = (218.316 + 13.176396 * d) * RAD, M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.22935 * d) * RAD;
    return { lam: L + 6.289 * RAD * Math.sin(M), beta: 5.128 * RAD * Math.sin(F) };
  }
  /** Mean heliocentric longitudes (J2000 elements, degrees and degrees/day). */
  const ORBITS = [
    [252.25, 4.09233], // Mercury
    [181.98, 1.60213], // Venus
    [100.46, 0.98561], // Earth
    [355.43, 0.52403], // Mars
    [34.4, 0.08309], // Jupiter
    [49.94, 0.03346], // Saturn
  ];

  // ── the sky's colours by the Sun's altitude: night, twilight, golden hour, day ──
  const STOPS: [number, string, string, string][] = [
    [-90, "#03050b", "#060b19", "#000000"],
    [-18, "#03050b", "#070d1d", "#000000"],
    [-12, "#050a1c", "#0f1b38", "#24163a"],
    [-6, "#0a1634", "#2e3560", "#6a3a48"],
    [-2, "#16285a", "#6a5272", "#d0663a"],
    [2, "#2b4a82", "#d48a5e", "#ffad6a"],
    [8, "#5a86bd", "#e6bb93", "#ffd09a"],
    [18, "#6c9bd2", "#cfe0ee", "#fff0d6"],
    [40, "#76a5da", "#dbe8f3", "#fffaf0"],
    [90, "#76a5da", "#dbe8f3", "#fffaf0"],
  ];
  function rgb(hex: string) {
    return [1, 3, 5].map(function (i) {
      return parseInt(hex.slice(i, i + 2), 16) / 255;
    });
  }
  function mix(a: number[], b: number[], t: number) {
    return a.map(function (v, i) {
      return v + (b[i] - v) * t;
    });
  }
  function palette(alt: number) {
    let i = 0;
    while (i < STOPS.length - 2 && alt > STOPS[i + 1][0]) i++;
    const a = STOPS[i], b = STOPS[i + 1];
    const t = Math.min(1, Math.max(0, (alt - a[0]) / (b[0] - a[0])));
    return { zenith: mix(rgb(a[1]), rgb(b[1]), t), horizon: mix(rgb(a[2]), rgb(b[2]), t), glow: mix(rgb(a[3]), rgb(b[3]), t) };
  }
  function luminance(c: number[]) {
    const l = c.map(function (v) {
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }
  function contrast(a: number, b: number) {
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /** The sky at a given moment. `override` ("HH:MM", optionally with "YYYY-MM-DD") is for previews and tests. */
  function sky(date?: Date, opts?: { phone?: boolean }): SkyState {
    const now = date || new Date();
    const at = place();
    const d = days(now.getTime());
    const horizonY = opts && opts.phone ? 0.93 : 0.91;
    const facing = at.lat >= 0 ? 180 : 0; // look towards the equator, where the Sun and the planets travel
    const screen = function (alt: number, az: number) {
      let rel = ((az - facing + 540) % 360) - 180; // -180..180, 0 straight ahead
      const x = 0.5 + 0.47 * (rel / 180);
      const y = alt >= 0
        ? horizonY - (horizonY - 0.07) * Math.pow(Math.sin(alt * RAD), 0.62)
        : horizonY + Math.min(0.6, (-alt / 25) * 0.35);
      return { x: x, y: y };
    };

    const sl = sunLongitude(d);
    const se = toEquatorial(sl, 0, d);
    const sh = horizontal(se.ra, se.dec, d, at.lat, at.lon);
    const ss = screen(sh.alt, sh.az);

    const me = moonEcliptic(d);
    const mq = toEquatorial(me.lam, me.beta, d);
    const mh = horizontal(mq.ra, mq.dec, d, at.lat, at.lon);
    const ms = screen(mh.alt, mh.az);
    const elong = (((me.lam - sl) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    const pal = palette(sh.alt);
    const stars = Math.min(1, Math.max(0, (-sh.alt - 3) / 11));
    const daylight = Math.min(1, Math.max(0, (sh.alt + 4) / 22));

    // Readability: sample the sky where text stands (from the top bar down to the gateways), choose
    // the ink that needs the least haze, and find the haze that gives every band 4.5:1 against it.
    const bands = [0.06, 0.25, 0.45, 0.65, 0.8].map(function (y) {
      const h = Math.max(0, Math.min(1, (horizonY - y) / horizonY));
      return mix(pal.horizon, pal.zenith, Math.pow(h, 0.55));
    });
    // the luminance of the secondary inks in worlds.css (the main inks are stronger, so they pass too)
    const LIGHT_INK = 0.56, DARK_INK = 0.036;
    const need = function (ink: number, hazeColor: number[]) {
      for (let a = 0; a <= 0.7; a += 0.02) {
        const ok = bands.every(function (c) {
          return contrast(ink, luminance(mix(c, hazeColor, a))) >= 4.6;
        });
        if (ok) return a;
      }
      return 0.7;
    };
    const darkHaze = [0.02, 0.03, 0.07], lightHaze = [0.93, 0.95, 0.98];
    const aLight = need(LIGHT_INK, darkHaze), aDark = need(DARK_INK, lightHaze);
    const ink: "light" | "dark" = aDark < aLight ? "dark" : "light";

    const planets = ORBITS.map(function (o) {
      return ((o[0] + o[1] * d) % 360) * RAD;
    });
    const phase = sh.alt > 6 ? "day" : sh.alt < -10 ? "night" : now.getHours() < 12 ? "dawn" : "dusk";
    return {
      sun: { alt: sh.alt, az: sh.az, x: ss.x, y: ss.y },
      moon: {
        alt: mh.alt, az: mh.az, x: ms.x, y: ms.y, elongation: elong,
        illuminated: (1 - Math.cos(elong)) / 2, waxing: elong < Math.PI,
      },
      zenith: pal.zenith,
      horizon: pal.horizon,
      glow: pal.glow,
      stars: stars,
      daylight: daylight,
      ink: ink,
      haze: ink === "dark" ? lightHaze : darkHaze,
      hazeAlpha: ink === "dark" ? aDark : aLight,
      horizonY: horizonY,
      planets: planets,
      phase: phase,
    };
  }

  /** The moment to show: now, or a time given in the address for previews (?at=06:30, ?at=2026-11-17T18:05). */
  function moment(search?: string) {
    const q = /[?&]at=([^&]+)/.exec(search || "");
    if (!q) return new Date();
    const v = decodeURIComponent(q[1]);
    const m = /^(?:(\d{4}-\d{2}-\d{2})T?)?(\d{1,2}):(\d{2})$/.exec(v);
    if (!m) return new Date();
    const base = m[1] ? new Date(m[1] + "T00:00:00") : new Date();
    base.setHours(+m[2], +m[3], 0, 0);
    return base;
  }

  /** Writes the sky onto <html>: data-sky (ink), data-sky-phase, and colours for the CSS. */
  function apply(root: HTMLElement, s: SkyState) {
    const css = function (c: number[], a?: number) {
      const v = c.map(function (x) {
        return Math.round(x * 255);
      });
      return a === undefined ? "rgb(" + v.join(" ") + ")" : "rgb(" + v.join(" ") + " / " + a.toFixed(3) + ")";
    };
    root.setAttribute("data-sky", s.ink === "dark" ? "day" : "night");
    root.setAttribute("data-sky-phase", s.phase);
    const st = root.style;
    st.setProperty("--sky-zenith", css(s.zenith));
    st.setProperty("--sky-horizon", css(s.horizon));
    st.setProperty("--sky-glow", css(s.glow));
    st.setProperty("--sky-haze", css(s.haze, s.hazeAlpha));
    st.setProperty("--sky-stars", s.stars.toFixed(3));
    st.setProperty("--sun-x", (s.sun.x * 100).toFixed(2) + "%");
    st.setProperty("--sun-y", (s.sun.y * 100).toFixed(2) + "%");
    st.setProperty("--sun-light", s.daylight.toFixed(3));
  }

  /** The planets' longitudes `seconds` into the visit, on the illustrative orbital clock (ENV.earthYearSeconds). */
  function orbitsAt(start: Date, seconds: number) {
    const d = days(start.getTime()) + seconds * (365.25 / ENV.earthYearSeconds);
    return ORBITS.map(function (o) {
      return ((o[0] + o[1] * d) % 360) * RAD;
    });
  }

  return { ENV: ENV, sky: sky, moment: moment, apply: apply, place: place, orbitsAt: orbitsAt };
}

/** The inline script that sets the sky before the first paint. */
export const skyBootScript = `(function(){try{var e=(${cosmicEngine.toString()})();var d=document.documentElement;e.apply(d,e.sky(e.moment(location.search),{phone:innerWidth<900}))}catch(x){}})();`;
