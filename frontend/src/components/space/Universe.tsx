"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

import { cosmicEngine, type SkyState } from "./environment";
import { FRAGMENT, VERTEX, type ShaderName } from "./shaders";
import { NEEDS_EARTH, SHADER, worldForPath, type World } from "./worlds";

/** Called on a click that leaves the page (see Interactions): the view starts to pull away at once. */
let leave: () => void = () => {};
export const depart = () => leave();

/** The sky (Sun, Moon, daylight, events) lives over these worlds; the admin station keeps plain deep space. */
const LIVING_SKY: Partial<Record<World, boolean>> = { cosmos: true, system: true };
/** How often each world needs redrawing when nothing is being touched. Most of space moves very slowly. */
const CALM_FPS: Record<World, number> = { cosmos: 30, system: 30, saturn: 24, jupiter: 24, earth: 24, mars: 12, moon: 5, station: 10 };
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
    const sky = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, sky);
    for (let i = 0; i < 6; i++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const earth = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, earth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([4, 10, 24, 255]));
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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
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
    // the environment: recomputed every second (it changes by the minute); the orrery runs on its own clock
    const engine = cosmicEngine();
    const visitStart = performance.now();
    const skyStart = engine.moment(location.search);
    const skyOffset = skyStart.getTime() - Date.now(); // non-zero only when previewing another time (?at=)
    let skyState: SkyState = engine.sky(skyStart, { phone: phone() });
    let skyAt = 0;
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
      calibrating = 50;
      slow = 0;
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

      // Where the page wants its world: the [data-stage] element, pinned to the viewport
      // (measured as if the page were at the top, so the backdrop never moves under the reader).
      const stage = document.querySelector<HTMLElement>("[data-stage]")?.getBoundingClientRect();
      const top = (stage?.top ?? h * 0.12) + window.scrollY, sw = stage?.width ?? w * 0.4, sh = stage?.height ?? h * 0.3;
      const cx = (stage ? stage.left + sw / 2 : w * 0.78) * sc, cy = H - (top + sh / 2) * sc;
      const fit: Record<World, number> = {
        saturn: Math.min(sw / 5.4, sh / 2.5), jupiter: Math.min(sw / 2.4, sh / 1.15), earth: Math.min(sw / 2.6, sh / 1.5),
        moon: Math.min(sw / 9, sh / 4.6), mars: sh, cosmos: sh, system: sh, station: sh,
      };
      gl.uniform3f(U("uSubject"), cx, cy, Math.max(8, fit[shown] * sc));
      gl.uniform1f(U("uHorizon"), H - (top + sh + (phone() ? 6 : 18)) * sc);

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
        });
        gl.uniform1i(U("uOrbN"), marks.length);
        gl.uniform4fv(U("uOrb"), orb);
        gl.uniform4fv(U("uOrbA"), orbA);
        gl.uniform4fv(U("uOrbB"), orbB);
        gl.uniform1f(U("uGalaxy"), shown === "cosmos" ? 1 : shown === "system" ? 0.35 : 0);
        gl.uniform2f(U("uGalaxyAt"), phone() ? 0.05 : 0.66, phone() ? 0.5 : 0.12); // clear of the name and the gateways

        const living = !!LIVING_SKY[shown];
        if (now - skyAt > 1000) {
          skyState = engine.sky(new Date(Date.now() + skyOffset), { phone: phone() });
          skyAt = now;
        }
        const sky = skyState, W = canvas.width;
        const elapsed = frozen ? 0 : (now - visitStart) / 1000;
        gl.uniform1f(U("uEnv"), living ? 1 : 0);
        gl.uniform1f(U("uHorizon"), H - sky.horizonY * H);
        gl.uniform2f(U("uSunPos"), sky.sun.x * W, H - sky.sun.y * H);
        gl.uniform1f(U("uSunAlt"), engine.ENV.sun ? sky.sun.alt : -90);
        gl.uniform2f(U("uMoonPos"), sky.moon.x * W, H - sky.moon.y * H);
        gl.uniform1f(U("uMoonAlt"), engine.ENV.moon ? sky.moon.alt : -90);
        gl.uniform1f(U("uMoonElong"), sky.moon.elongation);
        gl.uniform3fv(U("uZen"), sky.zenith);
        gl.uniform3fv(U("uHor"), sky.horizon);
        gl.uniform3fv(U("uGlow"), sky.glow);
        gl.uniform1f(U("uStars"), sky.stars);
        gl.uniform1f(U("uClock"), frozen ? 0.5 : (Date.now() / 1000) % 100000);
        gl.uniform1f(U("uEvents"), engine.ENV.events && !frozen ? 1 : 0);
        gl.uniform1fv(U("uTheta"), engine.ENV.planets ? engine.orbitsAt(skyStart, elapsed) : sky.planets);
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
      const active = now < busyUntil || travel > 0 || travelTo > 0 || reveal < 1 || calibrating > 0 || skyOn < 1 || (NEEDS_EARTH[shown] && earthOn < 1);
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

    const onPointer = (e: PointerEvent) => {
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
      window.removeEventListener("scroll", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return <canvas ref={canvasRef} className="space-canvas" aria-hidden />;
}
