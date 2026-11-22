"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

import { FRAGMENT, VERTEX, type ShaderName } from "./shaders";
import { BODIES, DEEP, DEEP_REACH, FIRST_EXAM, MAX_EXAMS, N_ORBITS, PLUTO, SUN, deepPlacesBand, layoutBand, pick, toScreen, type DeepPlace, type Layout } from "./solar";
import { NEEDS_EARTH, SHADER, worldForPath, type World } from "./worlds";

/** Called on a click that leaves the page (see Interactions): the view starts to pull away at once. */
let leave: () => void = () => {};
export const depart = () => leave();

/** Shooting stars, meteors and comets cross these skies; the admin station stays quiet. */
const EVENTS: Partial<Record<World, boolean>> = { solar: true, cosmos: true, system: true };
/** How often each world needs redrawing when nothing is being touched. Most of space moves very slowly. */
const CALM_FPS: Record<World, number> = { solar: 30, cosmos: 30, system: 30, saturn: 24, jupiter: 24, earth: 24, mars: 12, moon: 5, station: 10 };
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The universe behind the page: one fixed WebGL canvas, one full-screen shader per world
 * (shaders.ts), compiled the first time its world is visited. Until the first frame is drawn —
 * and for good, where WebGL2 is unavailable or the context is lost — CSS shows a still of the
 * same world (.space-poster), so nothing here is ever needed to read the page.
 *
 * Costs are kept down four ways: worlds redraw at their own calm rate and only speed up
 * while the pointer moves or we are in transit; the canvas renders below screen resolution
 * and steps down further if frames run slow; phones get cheaper noise and smaller textures;
 * and drawing stops when the tab is hidden or the reader has scrolled into the content.
 */
export default function Universe() {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wanted = useRef<World>(worldForPath(pathname));
  const kick = useRef<() => void>(() => {});

  // The interface changes world with the page; the canvas follows a moment behind, through darkness.
  useIsoLayoutEffect(() => {
    const world = worldForPath(pathname);
    wanted.current = world;
    document.documentElement.dataset.world = world;
    kick.current();
  }, [pathname]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = document.documentElement;
    const gl = canvas?.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!canvas || !gl) {
      root.dataset.space = "still";
      return;
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const still = () => reduced.matches || root.dataset.motion === "off";
    const phone = () => window.innerWidth < 900;

    // ── programs ──
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const vertex = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertex, VERTEX);
    gl.compileShader(vertex);
    type Program = { handle: WebGLProgram; at: Map<string, WebGLUniformLocation | null> };
    const programs = new Map<ShaderName, Program | null>();
    const programFor = (name: ShaderName): Program | null => {
      if (programs.has(name)) return programs.get(name)!;
      const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(fragment, FRAGMENT[name]);
      gl.compileShader(fragment);
      const handle = gl.createProgram()!;
      gl.attachShader(handle, vertex);
      gl.attachShader(handle, fragment);
      gl.bindAttribLocation(handle, 0, "a");
      gl.linkProgram(handle);
      const ok = gl.getProgramParameter(handle, gl.LINK_STATUS);
      if (!ok) console.warn(`[space] ${name} failed to build`, gl.getShaderInfoLog(fragment) || gl.getProgramInfoLog(handle));
      const program = ok ? { handle, at: new Map() } : null;
      programs.set(name, program);
      return program;
    };
    let current: Program | null = null;
    const U = (name: string) => {
      if (!current) return null;
      if (!current.at.has(name)) current.at.set(name, gl.getUniformLocation(current.handle, name));
      return current.at.get(name)!;
    };

    // ── textures: the sky survey (unit 0) and Earth (unit 1), fetched only when a world needs them ──
    const load = (src: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    let skyOn = 0, earthOn = 0, skyAsked = false, earthAsked = false, skyReady = false, earthReady = false;
    let nightOn = 0, nightAsked = false, nightReady = false;
    const sky = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, sky);
    for (let i = 0; i < 6; i++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const earth = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, earth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([4, 10, 24, 255]));
    // the night side's city lights (unit 5), for Earth up close and Earth seen from the Moon
    const night = gl.createTexture();
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, night);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const askNight = async () => {
      if (nightAsked) return;
      nightAsked = true;
      const img = await load(`/space/earth-night-${phone() ? "1k" : "2k"}.webp`);
      if (dead || !img) return;
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, night);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      nightReady = true;
      start();
    };
    const askSky = async () => {
      if (skyAsked) return;
      skyAsked = true;
      const small = phone() ? "-s" : "";
      const faces = await Promise.all(["px", "nx", "py", "ny", "pz", "nz"].map((f) => load(`/space/sky-${f}${small}.webp`)));
      if (dead || faces.some((f) => !f)) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, sky);
      faces.forEach((f, i) => gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, f!));
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      skyReady = true;
      start();
    };
    const askEarth = async () => {
      if (earthAsked) return;
      earthAsked = true;
      const img = await load(`/space/earth-${phone() ? "1k" : "2k"}.webp`);
      if (dead || !img) return;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, earth);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D); // the home page's Earth is a few pixels across
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      earthReady = true;
      start();
    };

    // ── state ──
    let dead = false, raf = 0, shown: World = wanted.current, drawn = false;
    let w = 0, h = 0, scale = 1, quality = phone() ? 0.62 : 0.85;
    let travel = 0, travelTo = 0, leaving = 0;
    let reveal = 1, px = 0, py = 0, tx = 0, ty = 0;
    let lastDraw = 0, lastFrame = 0, busyUntil = 0, slow = 0, calibrating = 50;
    const hover = new Float32Array(6);
    // the examinations' emblems (units 2–4), fetched the first time a page shows them
    const emblemSlots = new Map<string, number>(); // url -> slot
    const emblemOn = new Float32Array(3), emblemReady = [false, false, false];
    const emblemTex = [0, 1, 2].map((k) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE2 + k);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      return t;
    });
    const emblemSlot = (url: string) => {
      if (emblemSlots.has(url)) return emblemSlots.get(url)!;
      if (emblemSlots.size >= 3) return -1;
      const k = emblemSlots.size;
      emblemSlots.set(url, k);
      load(url).then((img) => {
        if (dead || !img) return;
        gl.activeTexture(gl.TEXTURE2 + k);
        gl.bindTexture(gl.TEXTURE_2D, emblemTex[k]);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        emblemReady[k] = true;
        start();
      });
      return k;
    };
    const orbE = new Float32Array(6).fill(-1);
    // the home page's solar system (solar.ts): what is pointed at, and the last layout, for picking
    const NB = FIRST_EXAM + MAX_EXAMS;
    const bodyHover = new Float32Array(NB), orbitHover = new Float32Array(N_ORBITS);
    const uB = new Float32Array(NB * 4), uAx = new Float32Array(NB * 4);
    const uOC = new Float32Array(N_ORBITS * 4), uOU = new Float32Array(N_ORBITS * 4), uON = new Float32Array(N_ORBITS * 4), uOK = new Float32Array(N_ORBITS);
    const uES = new Float32Array(MAX_EXAMS), uET = new Float32Array(MAX_EXAMS * 3);
    const t0 = performance.now();
    let solar: Layout | null = null, pointed = -1, pointedUntil = 0, tipShown = -1;
    let mx = 0, my = 0, mouseIn = false; // the mouse, when it is over open space (not over text or a control)
    let spots: HTMLElement[] = []; // the portals, in order
    // beyond the system: Andromeda, a nebula, a black hole, a ring nebula, a pulsar (solar.ts DEEP)
    let deep: DeepPlace[] = [];
    const uDeep = new Float32Array(DEEP.length * 4), deepHover = new Float32Array(DEEP.length);
    const DEEP_TIP = 200; // tip index of the first deep-sky object
    const pickDeep = (x: number, y: number) =>
      deep.findIndex((d, k) => d.s > 0 && (x - d.x) ** 2 + (y - d.y) ** 2 < (d.s * DEEP_REACH[k]) ** 2);
    const orb = new Float32Array(24), orbA = new Float32Array(24), orbB = new Float32Array(24);
    // The opening: on the first page of a visit, space comes up out of darkness.
    try {
      if (!sessionStorage.getItem("arrived") && !still()) {
        sessionStorage.setItem("arrived", "1");
        reveal = 0;
        root.dataset.arriving = "on";
        window.setTimeout(() => root.removeAttribute("data-arriving"), 2600);
      }
    } catch {}

    const resize = () => {
      // the canvas's own box (the viewport), not innerWidth: a phone's layout viewport can be wider for a moment
      w = canvas.clientWidth || window.innerWidth;
      h = canvas.clientHeight || window.innerHeight;
      scale = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
      canvas.width = Math.max(2, Math.round(w * scale));
      canvas.height = Math.max(2, Math.round(h * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const enter = (world: World) => {
      shown = world;
      current = programFor(SHADER[world]);
      if (current) gl.useProgram(current.handle);
      askSky();
      if (NEEDS_EARTH[world]) askEarth();
      if (world === "earth" || world === "moon") askNight();
      calibrating = 50;
      slow = 0;
    };

    /** The home page: fit the system to the page, place the examinations' spheres, and hand it all to the shader. */
    const drawSolar = (now: number, dt: number, frozen: boolean, sc: number, H: number) => {
      // the page: a band where the distant system lies, and the portals (each with its sphere's window)
      const bandEl = document.querySelector<HTMLElement>("[data-solar-band]");
      if (!bandEl) return;
      const portals = Array.from(document.querySelectorAll<HTMLElement>("[data-portal]")).slice(0, MAX_EXAMS);
      const br = bandEl.getBoundingClientRect();
      const band = { x: br.left, y: br.top, w: br.width, h: br.height };
      const isPhone = phone();
      const t = frozen ? 30 : (now - t0) / 1000;
      const l = layoutBand({ t, phone: isPhone, band, exams: portals.length, lean: frozen ? [0, 0] : [px, py] });
      solar = l;
      spots = portals;
      // what is pointed at: a planet (or a distant examination) by picking, an examination by its portal
      const examOver = portals.map((el) => (el.matches(":hover, :focus-visible") ? 1 : 0));
      deep = deepPlacesBand(band, isPhone);
      const hit = mouseIn ? pick(l, mx, my, 4) : -1;
      const deepHit = mouseIn && hit < 0 ? pickDeep(mx, my) : -1;
      const over = now < pointedUntil ? pointed : hit >= 0 ? hit : deepHit >= 0 ? DEEP_TIP + deepHit : -1;
      deep.forEach((d, k) => {
        deepHover[k] += ((over === DEEP_TIP + k ? 1 : 0) - deepHover[k]) * Math.min(1, dt * 8);
        uDeep.set([d.x * sc, H - d.y * sc, d.s * sc, d.a], k * 4);
      });
      for (let i = 0; i < NB; i++) {
        const want = i === over || (i >= FIRST_EXAM && examOver[i - FIRST_EXAM]) ? 1 : 0;
        bodyHover[i] += (want - bodyHover[i]) * Math.min(1, dt * 7);
      }
      const nb = FIRST_EXAM + portals.length;
      for (let i = 0; i < nb; i++) {
        const P = l.scene.pos[i], r = l.scene.rad[i] * (1 + bodyHover[i] * (i === SUN ? 0.03 : 0.14));
        uB.set([P[0], P[1], P[2], r], i * 4);
        const A = l.scene.axis[i];
        uAx.set([A[0], A[1], A[2], l.scene.spin[i]], i * 4);
      }
      l.scene.orbits.forEach((o, k) => {
        uOC.set([o.c[0], o.c[1], o.c[2], o.a], k * 4);
        uOU.set([o.U[0], o.U[1], o.U[2], o.b], k * 4);
        uON.set([o.N[0], o.N[1], o.N[2], o.E], k * 4);
        uOK[k] = o.body >= FIRST_EXAM ? 2 : o.body === PLUTO ? 1 : 0;
        orbitHover[k] = bodyHover[o.body];
      });
      // each portal's sphere, in its window: the same examination, close up
      portals.forEach((el, k) => {
        const url = el.dataset.emblem;
        uES[k] = url ? emblemSlot(isPhone ? url.replace(/\.webp$/, "-s.webp") : url) : -1;
        const tint = (el.dataset.tint ?? "0.2,0.3,0.6").split(",").map(Number);
        uET.set(tint.slice(0, 3), k * 3);
      });
      for (let k = 0; k < 3; k++) emblemOn[k] = Math.min(1, emblemOn[k] + (emblemReady[k] ? dt * 2.5 : 0));
      showTip(over, portals);
      document.body.style.cursor = mouseIn && hit >= FIRST_EXAM ? "pointer" : ""; // a distant examination is a way in too

      const c = l.cam;
      gl.uniform3f(U("uCamPos"), ...c.pos);
      gl.uniform3f(U("uCamR"), ...c.R);
      gl.uniform3f(U("uCamU"), ...c.U);
      gl.uniform3f(U("uCamF"), ...c.F);
      gl.uniform1f(U("uFocal"), c.zoom * c.D * sc);
      gl.uniform2f(U("uCenter"), c.cx * sc, H - c.cy * sc);
      gl.uniform1i(U("uNB"), nb);
      gl.uniform4fv(U("uB"), uB);
      gl.uniform4fv(U("uAx"), uAx);
      gl.uniform1fv(U("uHov"), bodyHover);
      gl.uniform1i(U("uNO"), l.scene.orbits.length);
      gl.uniform4fv(U("uOC"), uOC);
      gl.uniform4fv(U("uOU"), uOU);
      gl.uniform4fv(U("uON"), uON);
      gl.uniform1fv(U("uOH"), orbitHover);
      gl.uniform1fv(U("uOK"), uOK);
      gl.uniform1fv(U("uES"), uES);
      gl.uniform3fv(U("uET"), uET);
      gl.uniform1i(U("uE0"), 2);
      gl.uniform1i(U("uE1"), 3);
      gl.uniform1i(U("uE2"), 4);
      gl.uniform3fv(U("uEmblemOn"), emblemOn);
      gl.uniform4fv(U("uDeep"), uDeep);
      gl.uniform1fv(U("uDeepH"), deepHover);
      gl.uniform1f(U("uGalaxy"), 0.55);
      gl.uniform2f(U("uGalaxyAt"), isPhone ? 0.3 : 0.62, isPhone ? 0.62 : 0.36); // high, off to the side, clear of the name
      gl.uniform1f(U("uClock"), frozen ? 0.5 : (Date.now() / 1000) % 100000);
      gl.uniform1f(U("uEvents"), !frozen ? 1 : 0);
    };

    /** The label beside what is pointed at: its name, what it is, a line about it. */
    const KIND = { star: "Star", planet: "Planet", moon: "Natural satellite", dwarf: "Dwarf planet" } as const;
    const showTip = (i: number, spots: HTMLElement[]) => {
      const tip = document.querySelector<HTMLElement>("[data-solar-tip]");
      if (!tip || !solar) return;
      if (i < 0) {
        if (tipShown !== -1) tip.removeAttribute("data-open");
        tipShown = -1;
        return;
      }
      const dp = i >= DEEP_TIP ? deep[i - DEEP_TIP] : null;
      const s = dp ? { x: dp.x, y: dp.y } : toScreen(solar.cam, solar.scene.pos[i]);
      const r = dp ? dp.s * Math.min(DEEP_REACH[i - DEEP_TIP], 1) : solar.scene.rad[i] * toScreen(solar.cam, solar.scene.pos[i]).k;
      if (tipShown !== i) {
        tipShown = i;
        const [kind, name, text] = tip.children as unknown as HTMLElement[];
        if (dp) {
          const o = DEEP[i - DEEP_TIP];
          kind.textContent = o.kind;
          name.textContent = o.name;
          text.textContent = o.blurb;
        } else if (i >= FIRST_EXAM) {
          const el = spots[i - FIRST_EXAM];
          kind.textContent = el.dataset.kind ?? "Examination";
          name.textContent = el.dataset.name ?? "";
          text.textContent = el.dataset.text ?? "";
        } else {
          const b = BODIES[i];
          kind.textContent = i === SUN ? "The centre" : KIND[b.kind];
          name.textContent = b.name;
          text.textContent = b.blurb;
        }
        tip.dataset.open = "";
      }
      const below = s.y - r - 14 < 150; // no room above: show it underneath
      const w = tip.offsetWidth || 260, hgt = tip.offsetHeight || 90;
      const x = Math.max(10, Math.min(window.innerWidth - w - 10, s.x - w / 2));
      const y = below ? s.y + r + 14 : s.y - r - 14 - hgt;
      tip.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    };
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - lastDraw) / 1000 || 0.016);
      lastDraw = now;
      const frozen = still();
      // in transit: pull away from one world, arrive at the next
      if (wanted.current !== shown) travelTo = 1;
      if (travelTo === 1 && (travel > 0.96 || frozen) && wanted.current !== shown) {
        enter(wanted.current);
        travelTo = 0;
      } else if (travelTo === 1 && wanted.current === shown && now > leaving) travelTo = 0; // the click led nowhere
      travel += (travelTo - travel) * Math.min(1, dt * (travelTo ? 11 : 4.2));
      if (frozen) travel = 0;
      if (travel < 0.003 && travelTo === 0) travel = 0;
      reveal = frozen ? 1 : Math.min(1, reveal + dt / 2.4);
      skyOn = Math.min(1, skyOn + (skyReady ? dt * 1.4 : 0));
      earthOn = Math.min(1, earthOn + (earthReady ? dt * 1.6 : 0));
      nightOn = Math.min(1, nightOn + (nightReady ? dt * 1.6 : 0));
      px += (tx - px) * Math.min(1, dt * 4);
      py += (ty - py) * Math.min(1, dt * 4);
      if (!current) return;

      if (canvas.clientWidth > 0 && (canvas.clientWidth !== w || canvas.clientHeight !== h)) resize();
      const H = canvas.height, sc = scale;
      gl.uniform2f(U("uRes"), canvas.width, H);
      gl.uniform1f(U("uTime"), frozen ? 40 : (now / 1000) % 3600);
      gl.uniform2f(U("uPointer"), frozen ? 0 : px, frozen ? 0 : -py);
      gl.uniform1f(U("uReveal"), reveal);
      gl.uniform1f(U("uTravel"), travel);
      gl.uniform1f(U("uLite"), phone() || quality < 0.6 ? 1 : 0);
      gl.uniform1i(U("uSky"), 0);
      gl.uniform1f(U("uSkyOn"), skyOn);
      gl.uniform1i(U("uEarth"), 1);
      gl.uniform1f(U("uEarthOn"), earthOn);
      gl.uniform1i(U("uNight"), 5);
      gl.uniform1f(U("uNightOn"), nightOn);

      // Where the page wants its world: the [data-stage] element, pinned to the viewport
      // (measured as if the page were at the top, so the backdrop never moves under the reader).
      const stage = document.querySelector<HTMLElement>("[data-stage]")?.getBoundingClientRect();
      const top = (stage?.top ?? h * 0.12) + window.scrollY, sw = stage?.width ?? w * 0.4, sh = stage?.height ?? h * 0.3;
      const cx = (stage ? stage.left + sw / 2 : w * 0.78) * sc, cy = H - (top + sh / 2) * sc;
      const fit: Record<World, number> = {
        saturn: Math.min(sw / 5.4, sh / 2.5), jupiter: Math.min(sw / 2.4, sh / 1.15), earth: Math.min(sw / 2.6, sh / 1.5),
        moon: Math.min(sw / 9, sh / 4.6), mars: sh, solar: sh, cosmos: sh, system: sh, station: sh,
      };
      gl.uniform3f(U("uSubject"), cx, cy, Math.max(8, fit[shown] * sc));
      gl.uniform1f(U("uHorizon"), H - (top + sh + (phone() ? 6 : 18)) * sc);

      if (SHADER[shown] === "solar") drawSolar(now, dt, frozen, sc, H);
      if (SHADER[shown] === "cosmos") {
        // the worlds the page has put in view: [data-orb] elements, drawn where they are
        const marks = shown === "station" ? [] : Array.from(document.querySelectorAll<HTMLElement>("[data-orb]")).slice(0, 6);
        marks.forEach((el, i) => {
          const r = el.getBoundingClientRect();
          const over = el.closest("[data-orb-host]")?.matches(":hover, :focus-visible") ? 1 : 0;
          hover[i] += (over - hover[i]) * Math.min(1, dt * 7);
          const [ar, ag, ab, br, bg, bb, kind, ring] = (el.dataset.orb ?? "").split(",").map(Number);
          orb.set([(r.left + r.width / 2) * sc, H - (r.top + r.height / 2) * sc, (r.width / 2) * sc * (1 + hover[i] * 0.07), hover[i]], i * 4);
          orbA.set([ar, ag, ab, kind], i * 4);
          orbB.set([br, bg, bb, ring], i * 4);
          const emblem = el.dataset.emblem;
          orbE[i] = emblem ? emblemSlot(phone() ? emblem.replace(/\.webp$/, "-s.webp") : emblem) : -1;
        });
        for (let k = 0; k < 3; k++) emblemOn[k] = Math.min(1, emblemOn[k] + (emblemReady[k] ? dt * 2.5 : 0));
        gl.uniform1fv(U("uOrbE"), orbE);
        gl.uniform1i(U("uE0"), 2);
        gl.uniform1i(U("uE1"), 3);
        gl.uniform1i(U("uE2"), 4);
        gl.uniform3fv(U("uEmblemOn"), emblemOn);
        gl.uniform1i(U("uOrbN"), marks.length);
        gl.uniform4fv(U("uOrb"), orb);
        gl.uniform4fv(U("uOrbA"), orbA);
        gl.uniform4fv(U("uOrbB"), orbB);
        gl.uniform1f(U("uGalaxy"), shown === "cosmos" ? 1 : shown === "system" ? 0.35 : 0);
        gl.uniform2f(U("uGalaxyAt"), phone() ? 0.05 : 0.66, phone() ? 0.5 : 0.12); // clear of the name and the gateways

        gl.uniform1f(U("uClock"), frozen ? 0.5 : (Date.now() / 1000) % 100000);
        gl.uniform1f(U("uEvents"), EVENTS[shown] && !frozen ? 1 : 0);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!drawn) {
        drawn = true;
        root.dataset.space = "live";
      }
    };

    const loop = (now: number) => {
      raf = 0;
      if (dead) return;
      const gap = now - lastFrame;
      const active = now < busyUntil || travel > 0 || travelTo > 0 || reveal < 1 || calibrating > 0 || skyOn < 1 || (NEEDS_EARTH[shown] && earthOn < 1) || emblemReady.some((r, k) => r && emblemOn[k] < 1);
      const deep = window.scrollY > h * 0.9 && wanted.current === shown; // the reader is in the content: hold the last frame
      const every = active ? 0 : 1000 / CALM_FPS[shown];
      if (!deep && gap >= every - 2) {
        // while every frame is being drawn we can tell if this device keeps up, and render smaller if not
        if (active && gap < 250 && lastFrame) {
          slow = gap > 34 ? slow + 1 : Math.max(0, slow - 1);
          if (slow > 14 && quality > 0.42) {
            quality = Math.max(0.4, quality - 0.16);
            slow = 0;
            resize();
          }
        }
        if (calibrating > 0) calibrating--;
        lastFrame = now;
        draw(now);
      }
      if (!document.hidden && !(still() && drawn && wanted.current === shown) && !(deep && !active)) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && !dead) raf = requestAnimationFrame(loop);
    };
    kick.current = start;
    leave = () => {
      travelTo = 1;
      leaving = performance.now() + 3000;
      start();
    };

    const onPick = (e: PointerEvent) => {
      if (shown !== "solar" || !solar) return;
      const target = e.target as Element | null;
      const blocked = target?.closest?.("a, button, input, select, textarea, [data-solar-tip], .topbar, .bottom-nav");
      if (e.pointerType === "mouse") {
        mx = e.clientX;
        my = e.clientY;
        mouseIn = !blocked;
      }
      if (e.type === "pointerdown" && !blocked) {
        const hitExam = pick(solar, e.clientX, e.clientY, 6);
        if (hitExam >= FIRST_EXAM && spots[hitExam - FIRST_EXAM]) {
          spots[hitExam - FIRST_EXAM].click(); // a distant examination leads where its portal does
          return;
        }
      }
      if (e.pointerType !== "mouse" && e.type === "pointerdown" && !blocked) {
        // a tap on a planet shows what it is for a few seconds
        const i = pick(solar, e.clientX, e.clientY, 14);
        const k = i < 0 ? pickDeep(e.clientX, e.clientY) : -1;
        pointed = i >= 0 && i < FIRST_EXAM ? i : k >= 0 ? DEEP_TIP + k : -1;
        pointedUntil = pointed >= 0 ? performance.now() + 4000 : 0;
      }
      busyUntil = performance.now() + 600;
      start();
    };
    const onPointer = (e: PointerEvent) => {
      onPick(e);
      if (e.pointerType !== "mouse") return;
      tx = (e.clientX / w) * 2 - 1;
      ty = (e.clientY / h) * 2 - 1;
      busyUntil = performance.now() + 450;
      start();
    };
    const onResize = () => {
      resize();
      start();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      dead = true;
      root.dataset.space = "still";
    };
    const observer = new MutationObserver(start);
    observer.observe(root, { attributes: true, attributeFilter: ["data-motion"] });
    canvas.addEventListener("webglcontextlost", onLost);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPick, { passive: true });
    window.addEventListener("scroll", start, { passive: true });
    document.addEventListener("visibilitychange", start);
    resize();
    enter(shown);
    start();
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      leave = () => {};
      canvas.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPick);
      window.removeEventListener("scroll", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return <canvas ref={canvasRef} className="space-canvas" aria-hidden />;
}
