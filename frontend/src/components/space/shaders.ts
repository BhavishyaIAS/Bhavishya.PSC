/**
 * The worlds, as GLSL. Each is a single full-screen fragment shader that renders its
 * environment per pixel: spheres are intersected analytically, so planets, rings, shadows,
 * atmospheres and terminators are computed from geometry and light, not painted.
 *
 * What is real data and what is computed:
 *   • the star field and Milky Way  — Tycho-2 sky survey (cube map), plus computed pin-sharp stars
 *   • Earth                        — NASA Blue Marble; clouds, ocean glint and atmosphere are computed
 *   • Saturn, Jupiter, the Moon's and Mars's surfaces, the gateway planets — computed
 *
 * Shared uniforms (set by Universe.tsx):
 *   uRes      canvas size in pixels            uTime    seconds
 *   uPointer  pointer, -1..1 (smoothed)        uReveal  0..1, the opening
 *   uTravel   0..1, in transit between worlds  uLite    1 on phones / slow devices: cheaper noise
 *   uSubject  centre (px, y up) and radius of the main body
 *   uHorizon  height of the horizon in px (surface worlds)
 */

export const VERTEX = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform float uReveal;
uniform float uTravel;
uniform float uLite;
uniform vec3 uSubject;
uniform float uHorizon;
uniform samplerCube uSky;
uniform float uSkyOn;
out vec4 fragColor;

#define PI 3.14159265359

float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float h31(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 h33(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec2 p) {
  float a = .5, s = 0.; int n = uLite > .5 ? 3 : 5;
  for (int i = 0; i < 5; i++) { if (i >= n) break; s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= .5; }
  return s;
}
float fbm3(vec3 p) {
  float a = .5, s = 0.; int n = uLite > .5 ? 3 : 5;
  for (int i = 0; i < 5; i++) { if (i >= n) break; s += a * vnoise3(p); p = p * 2.02 + vec3(5.1, 1.7, 9.3); a *= .5; }
  return s;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

/* Pin-sharp stars: one candidate per cell of a 3D grid cut by the view sphere. Most are faint, a few are bright. */
vec3 starLayer(vec3 d, float scale, float rarity) {
  vec3 p = d * scale, id = floor(p);
  float m = h31(id + 3.1);
  if (m < rarity) return vec3(0);
  vec3 sp = id + .5 + (h33(id) - .5) * .6;
  float dd = length(p - sp), r = scale * .8 / uRes.y;
  float b = pow((m - rarity) / (1. - rarity), 3.);
  float core = smoothstep(r * 1.5, r * .2, dd) * (.1 + b * 2.);
  core += exp(-dd * dd / (r * r * 7.)) * b * b * 1.1 * smoothstep(.2, .1, dd);       // the brightest bloom a little
  vec3 tint = mix(vec3(1., .76, .58), vec3(.70, .83, 1.), h31(id + 9.7));
  float tw = .74 + .26 * sin(uTime * (1.3 + 3.1 * h31(id + 5.3)) + h31(id + 1.9) * 60.);  // they twinkle, each at its own pace
  return mix(vec3(1), tint, .7) * core * mix(1., tw, smoothstep(.2, .7, b) * .9 + .1);
}
vec3 starField(vec3 d, float amount) {
  vec3 c = starLayer(d, 60., .978) * 1.15 + starLayer(d, 135., .972) * .6;
  if (uLite < .5) c += starLayer(d, 300., .962) * .38;
  return c * amount;
}
/* The real sky: the Tycho-2 survey. Sampled soft, and lifted so the Milky Way reads as light, not as dots. */
vec3 realSky(vec3 d) {
  vec3 s = toLinear(textureLod(uSky, d, 2.2).rgb);
  s = max(s - .0016, 0.);
  return s * vec3(4.2, 4.5, 5.6) * uSkyOn;
}
/* View ray for the space worlds: a slow drift, and a lean with the pointer. */
vec3 viewRay(vec2 p, float drift) {
  vec3 rd = normalize(vec3(p, -1.55));
  rd.yz *= rot(.1 + uPointer.y * .02);
  rd.xz *= rot(drift + uTime * .0035 + uPointer.x * .03);
  return rd;
}
vec3 finish(vec3 col, vec2 fc) {
  vec2 q = fc / uRes;
  col *= mix(.72, 1., smoothstep(1.25, .35, length((q - .5) * vec2(1.1, 1.))));  // a lens, not a flat screen
  col *= 1. - uTravel;                                                           // in transit the view goes dark…
  col = aces(col * 1.05);
  col = pow(col, vec3(1. / 2.2));
  col += (h21(fc + fract(uTime) * 61.) - .5) / 255.;                              // dither away banding
  return col;
}

/* ── Rings (shared by Saturn and the ringed gateway) ── */
float ringTau(float r) {
  float t = 0.;
  t += smoothstep(1.235, 1.26, r) * smoothstep(1.53, 1.515, r) * (.10 + .08 * vnoise(vec2(r * 46., 1.)));        // C
  t += smoothstep(1.525, 1.54, r) * smoothstep(1.955, 1.945, r) * (.72 + .28 * vnoise(vec2(r * 70., 4.)));       // B
  t += smoothstep(1.95, 1.96, r) * smoothstep(2.03, 2.02, r) * .05;                                              // Cassini Division
  t += smoothstep(2.022, 2.035, r) * smoothstep(2.272, 2.266, r) * (.5 + .12 * vnoise(vec2(r * 60., 7.)))
       * (1. - .85 * smoothstep(.006, .002, abs(r - 2.214)));                                                    // A, with the Encke Gap
  t += smoothstep(.006, .001, abs(r - 2.326)) * .12;                                                             // F
  return t * (.8 + .2 * vnoise(vec2(r * 330., 2.)));
}
vec3 ringColor(float r) {
  vec3 c = mix(vec3(.74, .66, .54), vec3(.93, .87, .76), vnoise(vec2(r * 22., 3.)));
  return mix(c * .72, c, smoothstep(1.5, 1.6, r));
}

/* ── A generic computed planet: gas giant (kind 0) or rocky world (kind 1), with an optional ring ── */
vec4 planet(vec2 q, float kind, vec3 ca, vec3 cb, float ring, float seed, float spin, vec3 L) {
  float d2 = dot(q, q);
  if (d2 > 7.) return vec4(0);
  vec3 ax = normalize(vec3(.3, .9, .32));
  vec3 atm = mix(ca, vec3(.55, .7, 1.), .55);
  vec3 col = vec3(0); float alpha = 0.;
  // the ring plane, cut by this pixel's line of sight
  float zr = -(q.x * ax.x + q.y * ax.y) / ax.z; vec3 rp = vec3(q, zr); float rho = length(rp);
  float rA = 0.; vec3 rC = vec3(0);
  if (ring > .5 && rho > 1.2 && rho < 2.36) {
    rA = clamp(ringTau(rho) * 1.25, 0., 1.);
    float bl = dot(rp, L);
    float shadow = (bl < 0. && rho * rho - bl * bl < 1.) ? .06 : 1.;                     // the planet's shadow across the ring
    rC = ringColor(rho) * mix(cb, vec3(1), .6) * shadow * .95;
  }
  float aa = 2.5 / max(uSubject.z, 60.);
  if (d2 < 1.) {
    vec3 n = vec3(q, sqrt(1. - d2));
    vec3 e1 = normalize(cross(ax, vec3(0, 0, 1))), e2 = cross(ax, e1);
    float lat = asin(clamp(dot(n, ax), -1., 1.)), lon = atan(dot(n, e2), dot(n, e1)) + spin;
    vec3 sp = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
    vec3 alb;
    if (kind < .5) {
      float w = fbm3(sp * vec3(2.2, 9., 2.2) + seed), w2 = fbm3(sp * vec3(6., 30., 6.) + w * 2.4 + seed * 2.);
      float y = lat + (w - .5) * .16 + (w2 - .5) * .05;
      float b = smoothstep(.2, .8, sin(y * 9. + seed) * .5 + .5) * .7 + smoothstep(.4, .9, sin(y * 21. + seed * 3.) * .5 + .5) * .3;
      alb = mix(ca, cb, b) * (.78 + .44 * w2);
      alb = mix(alb, mix(ca, cb, .5) * .6, smoothstep(1.0, 1.4, abs(lat)));
    } else {
      float hgt = fbm3(sp * 2.4 + seed), det = fbm3(sp * 9. + seed * 3.);
      alb = mix(cb, ca, smoothstep(.36, .68, hgt)) * (.68 + .55 * det);
      alb = mix(alb, vec3(.86, .84, .82), smoothstep(1.32, 1.5, abs(lat) + det * .1) * .7);  // small polar caps
    }
    float ndl = dot(n, L), lit = pow(clamp(ndl, 0., 1.), .85);
    if (ring > .5) {                                                                     // the ring's shadow on the planet
      float s = -dot(n, ax) / dot(L, ax);
      if (s > 0.) { float rr = length(n + L * s); if (rr > 1.2 && rr < 2.36) lit *= exp(-ringTau(rr) * 2.2); }
    }
    col = alb * (lit * 1.25 + .006) * mix(.45, 1., pow(n.z, .5));
    col += atm * pow(1. - n.z, 3.6) * smoothstep(-.25, .35, ndl) * .4;                    // air on the limb
    alpha = smoothstep(1., 1. - aa, d2);
    if (rA > 0. && zr > n.z) { col = mix(col, rC, rA); }                                  // ring in front of the planet
  } else {
    float e = sqrt(d2) - 1.;
    float side = smoothstep(-.4, .6, dot(normalize(vec3(q, 0.)), L));
    float halo = exp(-e * 26.) * side;
    col = atm * halo * .5; alpha = halo * .5;
    if (rA > 0.) { col = mix(col, rC, rA); alpha = max(alpha, rA); }
  }
  return vec4(col, alpha);
}
`;

/* ═════════════════════════ THE LIVING SKY: landing, the exam systems, search, sign-in (and, without the sky, the admin station) ═════════════════════════
 *
 * Above a planet's curving horizon: the sky of this moment (environment.ts decides it from the reader's
 * clock — the Sun and the Moon where they are, the Moon in its phase, the light of dawn, day, dusk or
 * night), the deep sky behind it (survey stars, twinkling; nebulae drifting; galaxies), an orrery of
 * the solar system turning about the Sun, the examinations' own planets turning in sunlight, and now
 * and then a shooting star, a meteor, a comet or a satellite. uEnv = 0 leaves only deep space. */
const COSMOS = `
uniform float uGalaxy;        // how much of the great galaxy is in view
uniform vec2 uGalaxyAt;       // where it sits, in view units
uniform int uOrbN;
uniform vec4 uOrb[6];         // x, y (px, y up), radius, hover
uniform vec4 uOrbA[6];        // colour A, kind
uniform vec4 uOrbB[6];        // colour B, ring
uniform float uEnv;           // 1 = the living sky; 0 = deep space only
uniform vec2 uSunPos;         // px, y up
uniform float uSunAlt;        // degrees
uniform vec2 uMoonPos;
uniform float uMoonAlt;
uniform float uMoonElong;     // Sun–Moon elongation, radians (0 new … π full … 2π)
uniform vec3 uZen, uHor, uGlow; // sky colours (sRGB)
uniform float uStars;         // 1 night … 0 day
uniform float uClock;         // seconds, from the real clock: when events happen
uniform float uTheta[6];      // planets' longitudes on the orrery
uniform float uEvents;        // 1 = celestial events on

vec3 galaxy(vec3 rd) {
  vec3 gc = normalize(vec3(uGalaxyAt, -1.55)), gn = normalize(vec3(.34, .82, .46));
  float t = dot(gc, gn) / dot(rd, gn);
  if (t < 0.) return vec3(0);
  vec3 hp = rd * t - gc;
  vec3 e1 = normalize(cross(gn, vec3(0, 1, 0))), e2 = cross(gn, e1);
  vec2 uv = vec2(dot(hp, e1), dot(hp, e2)) / .3;
  float r = length(uv);
  if (r > 1.35) return vec3(0);
  float th = atan(uv.y, uv.x) + uTime * .004;
  float n = fbm(uv * 9. + 3.), n2 = fbm(uv * 26. + n * 2.);
  float phase = th * 2. - log(r + .03) * 4.4;
  float arm = pow(.5 + .5 * cos(phase + (n - .5) * 1.6), 2.2);
  float lane = pow(.5 + .5 * cos(phase + .9 + (n2 - .5) * 1.2), 6.) * smoothstep(.08, .3, r);
  float disc = exp(-r * 3.4), bulge = exp(-r * r * 46.);
  vec3 c = vec3(1., .86, .62) * bulge * 2.4;
  c += vec3(1., .9, .74) * disc * .5;
  c += vec3(.58, .72, 1.) * disc * arm * (.5 + 1.5 * n2) * 1.5;
  c += vec3(1., .42, .5) * disc * arm * smoothstep(.62, .8, n2) * 1.3;
  c *= 1. - lane * .7;
  c *= smoothstep(1.35, .5, r) * (.86 + .28 * h21(gl_FragCoord.xy));
  return c * .5;
}
/* far galaxies: now and then a faint tilted smudge between the stars */
vec3 farGalaxies(vec3 rd) {
  vec3 p = rd * 11., id = floor(p);
  float m = h31(id + 41.);
  if (m < .93) return vec3(0);
  vec3 c = id + .5 + (h33(id + 3.) - .5) * .5, e = normalize(h33(id + 9.) - .5);
  vec3 q = p - c;
  float along = dot(q, e), across = length(q - e * along);
  float g = exp(-(along * along / .0016 + across * across / .00022));
  return mix(vec3(.9, .8, .7), vec3(.7, .8, 1.), h31(id + 2.)) * g * .5;
}
float segment(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0., 1.);
  return length(pa - ba * h);
}
vec4 rnd4(float s, float k) { return vec4(h21(vec2(s, k)), h21(vec2(s, k + 3.7)), h21(vec2(s, k + 7.1)), h21(vec2(s, k + 11.3))); }

/* Shooting stars (common, faint, quick) and meteors (rare, bright, sometimes breaking up).
   Time is cut into slots; whether a slot has one, where and which way it goes, all come from the slot's number. */
vec3 meteors(vec2 fc, float vis) {
  vec3 acc = vec3(0);
  float u = uRes.y / 900.;
  for (int kind = 0; kind < 2; kind++) {
    float slot = kind == 0 ? 7. : 47.;
    float chance = kind == 0 ? .34 : .36;
    float base = floor(uClock / slot);
    for (int j = 0; j < 2; j++) {
      float s = base - float(j);
      vec4 r = rnd4(s, 13. + float(kind) * 50.);
      if (r.x > chance) continue;
      float dur = kind == 0 ? .5 + .55 * r.y : 1.2 + .9 * r.y;
      float t0 = s * slot + r.z * (slot - dur);
      float age = (uClock - t0) / dur;
      if (age < 0. || age > 1.) continue;
      vec4 r2 = rnd4(s, 31. + float(kind) * 50.);
      vec2 start = vec2(.06 + .88 * r2.x, .5 + .45 * r2.y) * uRes;
      float ang = (r2.z < .5 ? 3.55 : 4.95) + .7 * r2.w;          // down to the left, or down to the right
      vec2 dir = vec2(cos(ang), sin(ang));
      float run = (kind == 0 ? .22 + .12 * r.w : .42) * uRes.y;
      vec2 head = start + dir * run * age;
      float trail = (kind == 0 ? .08 : .17) * uRes.y * smoothstep(0., .3, age);
      float h, d = segment(fc, head - dir * trail, head, h);
      float wpx = (kind == 0 ? .8 : 1.5) * u;
      float fade = sin(3.14159 * pow(age, .8));
      float g = exp(-d * d / (wpx * wpx)) * pow(h, 2.4) * fade;
      g += exp(-dot(fc - head, fc - head) / (wpx * wpx * 9.)) * fade * (kind == 0 ? .5 : 1.4);  // the head glows
      vec3 tint = kind == 0 ? vec3(.86, .92, 1.) : mix(vec3(1., .74, .45), vec3(.62, 1., .74), step(.62, r.w));
      acc += tint * g * (kind == 0 ? .7 + 1.3 * r.y : 3.2);
      if (kind == 1 && r.w > .4 && age > .58) {                // it breaks up: two fragments run on and die away
        for (int f = 0; f < 2; f++) {
          vec2 fd = rot(f == 0 ? .07 : -.09) * dir;
          float fa = (age - .58) / .42;
          vec2 fh = head + fd * run * .16 * fa * (1. + float(f) * .3);
          float fhh, fdist = segment(fc, fh - fd * .04 * uRes.y, fh, fhh);
          acc += tint * exp(-fdist * fdist / (wpx * wpx * .6)) * pow(fhh, 2.) * (1. - fa) * 1.6;
        }
      }
    }
  }
  return acc * vis;
}

/* A comet: rare; drifts across the sky over a few minutes, its tails streaming away from the Sun. */
vec3 comet(vec2 fc, float vis) {
  float slot = 540., s = floor(uClock / slot);
  vec4 r = rnd4(s, 71.);
  if (r.x > .5) return vec3(0);
  float dur = 220., t0 = s * slot + r.y * (slot - dur);
  float age = (uClock - t0) / dur;
  if (age < 0. || age > 1.) return vec3(0);
  vec2 a = vec2(.12 + .3 * r.z, .62 + .3 * r.w) * uRes, b = a + vec2(.32 * (r.z < .5 ? 1. : -1.), -.12) * uRes.x;
  vec2 pos = mix(a, b, age);
  vec2 away = normalize(pos - uSunPos + vec2(.0001));
  float u = uRes.y / 900.;
  float bright = smoothstep(0., .15, age) * smoothstep(1., .82, age) * (.85 + .15 * sin(uClock * .7 + r.w * 9.));
  vec2 q = fc - pos;
  float along = dot(q, away), across = dot(q, vec2(-away.y, away.x));
  float len = .2 * uRes.y;
  float dust = along > 0. ? exp(-across * across / pow(3. * u + along * .16, 2.)) * exp(-along / len * 2.2) : 0.;
  float ion = along > 0. ? exp(-across * across / pow(1.2 * u + along * .03, 2.)) * exp(-along / len * 1.4) : 0.;
  float coma = exp(-dot(q, q) / pow(7. * u, 2.)), nucleus = exp(-dot(q, q) / pow(1.6 * u, 2.));
  vec3 c = vec3(1., .95, .84) * dust * .55 + vec3(.55, .78, 1.) * ion * .5 + vec3(.8, .95, 1.) * coma * .7 + vec3(1.) * nucleus * 2.2;
  return c * bright * vis;
}

/* A satellite: a steady point gliding across the evening sky, sometimes flaring as its panels catch the Sun. */
vec3 satellite(vec2 fc, float vis) {
  float slot = 83., s = floor(uClock / slot);
  vec4 r = rnd4(s, 97.);
  if (r.x > .42) return vec3(0);
  float dur = 55., t0 = s * slot + r.y * (slot - dur);
  float age = (uClock - t0) / dur;
  if (age < 0. || age > 1.) return vec3(0);
  vec2 a = vec2(r.z < .5 ? -.02 : 1.02, .55 + .4 * r.w) * uRes, b = vec2(r.z < .5 ? 1.02 : -.02, .62 + .3 * r.z) * uRes;
  vec2 pos = mix(a, b, age);
  float u = uRes.y / 900.;
  float flare = 1. + 5. * exp(-pow((age - .5 - .3 * (r.w - .5)) * 14., 2.)) * step(.7, r.y);
  return vec3(1., .97, .92) * exp(-dot(fc - pos, fc - pos) / pow(1.1 * u, 2.)) * .9 * flare * smoothstep(0., .08, age) * smoothstep(1., .92, age) * vis;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - .5 * uRes) / uRes.y / (1. + uTravel * .45);
  float u = uRes.y / 900.;
  vec3 rd = viewRay(p, 2.3);

  // ── the deep sky: survey stars, computed stars (twinkling), drifting nebulae, galaxies ──
  vec3 deep = realSky(rd) * 1.1 + starField(rd, 1.);
  float band = smoothstep(.0, .09, dot(deep, vec3(.3)));
  vec3 drift = vec3(uTime * .0021, 0., uTime * .0013);
  float neb = fbm3(rd * 2.4 + drift + fbm3(rd * 3.6 - drift) * 1.1);
  deep += (vec3(.5, .13, .2) * smoothstep(.52, .9, neb) + vec3(.07, .2, .26) * smoothstep(.56, .9, fbm3(rd * 3.1 + 7. + drift))) * (.05 + band * .3);
  vec3 rv = normalize(vec3(p, -1.55)); rv.yz *= rot(uPointer.y * .012); rv.xz *= rot(uPointer.x * .018);
  deep += galaxy(rv) * uGalaxy;
  if (uLite < .5) deep += farGalaxies(rd);

  // ── the atmosphere of this moment ──
  float W = uRes.x, Hh = uRes.y;
  float limb = uHorizon - pow((fc.x - .5 * W) / W, 2.) * Hh * .09;      // the horizon curves away at the edges
  float above = fc.y - limb;
  float ht = clamp(above / max(Hh - limb, 1.), 0., 1.);
  vec3 zen = toLinear(uZen), hor = toLinear(uHor), glw = toLinear(uGlow);
  vec3 sky = mix(hor, zen, pow(ht, .55));
  vec2 ds = (fc - uSunPos) / Hh;
  float dsun = length(ds);
  float sunUp = smoothstep(-14., 3., uSunAlt);
  sky += glw * (exp(-dsun * 7.5) * .2 + exp(-dsun * 20.) * .42) * sunUp;                        // light scattered about the Sun
  float twi = smoothstep(-14., -3., uSunAlt) * smoothstep(14., 2., uSunAlt);
  sky += glw * exp(-max(above, 0.) / (Hh * .05)) * exp(-abs(fc.x - uSunPos.x) / (W * .24)) * twi * .45; // dawn and dusk along the horizon
  float stars = mix(1., uStars, uEnv);
  vec3 col = sky * uEnv + deep * stars;

  // the Moon: where it is, in its phase, faint by day
  if (uEnv > .5 && uMoonAlt > -2.) {
    float rm = 15. * u;
    vec2 mq = (fc - uMoonPos) / rm;
    float m2 = dot(mq, mq);
    vec2 toSun = normalize(uSunPos - uMoonPos + vec2(.0001));
    float E = uMoonElong > 3.14159 ? 6.28318 - uMoonElong : uMoonElong;        // 0 new … π full
    vec3 Lm = normalize(vec3(toSun * sin(E), -cos(E)));
    if (m2 < 1.) {
      vec3 n = vec3(mq, sqrt(1. - m2));
      float maria = fbm(mq * 2.3 + 4.) , crater = fbm(mq * 9. + 1.);
      vec3 alb = vec3(.62, .61, .59) * (.72 + .3 * smoothstep(.35, .7, maria)) * (.9 + .2 * crater);
      float lit = smoothstep(-.03, .08, dot(n, Lm));
      vec3 mc = alb * (lit * 1.6 + .025 * stars);                                   // and a little earthshine on the dark side
      float a = smoothstep(1., .9, m2) * smoothstep(-2., 1.5, uMoonAlt);
      col = mix(col, mix(col + mc * .55, mc, stars * .8 + .2), a);
    }
    col += vec3(.75, .8, .9) * exp(-sqrt(m2) * 1.6) * .06 * stars * (1. - cos(E)) * smoothstep(-2., 2., uMoonAlt);  // its halo
  }

  // ── the orrery: the planets on their orbits about the Sun ──
  vec3 Lsun3 = normalize(vec3((uSunPos - .5 * uRes) / Hh, .7));
  if (uEnv > .5 && above > 0.) {
    float R[6] = float[6](.075, .115, .16, .215, .355, .5);
    float pr[6] = float[6](2.2, 3.4, 3.6, 2.8, 7., 6.);
    vec3 pc[6] = vec3[6](vec3(.62, .58, .55), vec3(.95, .86, .66), vec3(.35, .55, .9), vec3(.85, .42, .25), vec3(.86, .74, .6), vec3(.9, .8, .58));
    mat2 tilt = rot(-.1);
    float k = .3, kz = sqrt(1. - k * k);
    for (int i = 0; i < 6; i++) {
      float Ri = R[i] * Hh;
      vec2 uu = (fc - uSunPos) * tilt;
      float e = length(vec2(uu.x, uu.y / k)) / Ri;
      float line = 1. - smoothstep(0., 1.4, abs(e - 1.) / max(fwidth(e), 1e-4));
      col += vec3(.85, .89, 1.) * line * (uu.y > 0. ? .05 : .09) * mix(.6, 1., stars);
      float th = uTheta[i];
      vec2 pp = uSunPos + vec2(cos(th), sin(th) * k) * Ri * transpose(tilt);
      float rr = pr[i] * u;
      vec2 q = (fc - pp) / rr;
      float q2 = dot(q, q);
      if (q2 < 9.) {
        vec3 Lp = normalize(vec3(-cos(th), -k * sin(th), kz * sin(th)));
        if (q2 < 1.) {
          vec3 n = vec3(q, sqrt(1. - q2));
          float lit = max(dot(n, Lp), 0.);
          vec3 c = pc[i] * (lit * 1.5 + .04);
          if (i == 4) c *= .85 + .3 * sin(q.y * 9.);                                  // Jupiter's belts
          col = mix(col, c, smoothstep(1., .75, q2) * (sin(th) > 0. && length(fc - uSunPos) < 24. * u ? 0. : 1.));
        }
        if (i == 5) {                                                                  // Saturn's rings
          vec2 rq = q * rot(.35);
          float re = length(vec2(rq.x, rq.y / .32));
          col += vec3(.9, .82, .62) * smoothstep(.12, 0., abs(re - 1.9)) * .7 * (q2 < 1. && rq.y > 0. ? 0. : 1.);
        }
        col += pc[i] * exp(-q2 * .6) * .05;
      }
    }
  }

  // ── the examinations' own worlds, turning in sunlight ──
  vec3 L = uEnv > .5 ? normalize(mix(Lsun3, vec3(-.58, .34, .74), .25)) : normalize(vec3(-.58, .34, .74));
  for (int i = 0; i < 6; i++) {
    if (i >= uOrbN) break;
    vec4 o = uOrb[i];
    if (o.z < 1.) continue;
    vec2 q = (fc - o.xy - uPointer * o.z * .06) / (o.z * (1. + uTravel * .45));
    float spin = uTime * (uOrbA[i].w < .5 ? .055 : .022) * (1. + .15 * float(i)) + float(i);  // a gas giant turns faster than a rocky world
    vec4 pl = planet(q, uOrbA[i].w, uOrbA[i].rgb, uOrbB[i].rgb, uOrbB[i].w, float(i) * 7.3 + 1.7, spin, L);
    pl.rgb += sky * .06 * uEnv * step(.01, pl.a);                                       // the sky's light on its night side
    pl.rgb *= 1. + o.w * .35;
    col = mix(col, pl.rgb, pl.a);
  }

  // ── now and then ──
  if (uEnv > .5 && uEvents > .5 && above > 0.) {
    col += meteors(fc, mix(.12, 1., stars));
    col += comet(fc, mix(.1, 1., stars));
    col += satellite(fc, stars * smoothstep(-20., -5., uSunAlt) + stars * .3);
  }

  // ── the Sun: disc, corona, a restrained lens bloom ──
  if (uEnv > .5) {
    float rs = 17. * u;
    float d = length(fc - uSunPos);
    vec3 sunCol = mix(vec3(1., .5, .22), vec3(1., .97, .9), smoothstep(-2., 14., uSunAlt));
    float disc = smoothstep(rs, rs * .92, d);
    float corona = exp(-max(d - rs, 0.) / (rs * .55)) * .9 + exp(-max(d - rs, 0.) / (rs * 2.4)) * .35;
    float ang = atan(fc.y - uSunPos.y, fc.x - uSunPos.x);
    corona *= .85 + .15 * sin(ang * 12. + uTime * .05) * smoothstep(rs * 4., rs, d);
    col += sunCol * (disc * 7. + corona * 1.1) * smoothstep(-3., .5, uSunAlt);
    vec2 axis = .5 * uRes - uSunPos;                                                    // two faint ghosts along the line through the centre
    for (int g = 0; g < 2; g++) {
      vec2 gp = uSunPos + axis * (g == 0 ? 1.45 : 1.9);
      col += sunCol * exp(-pow(length(fc - gp) / ((g == 0 ? 10. : 24.) * u), 2.)) * (g == 0 ? .05 : .025) * smoothstep(4., 20., uSunAlt);
    }
  }

  // ── the ground: the planet's limb, its edge of air lit by the sky ──
  if (uEnv > .5) {
    float ground = smoothstep(.5, -.5, above);
    vec3 land = mix(vec3(.004, .007, .014), vec3(.035, .055, .08), smoothstep(-6., 20., uSunAlt));
    float lights = step(.9975, h21(floor(fc / (2. * u)))) * stars * smoothstep(-6. * u, -60. * u, above) * .1;  // towns, at night
    land += vec3(1., .72, .4) * lights;
    col = mix(col, land, ground);
    col += hor * exp(-abs(above) / (2.5 * u)) * .35;                                    // the bright edge of air
  }

  // the opening: space comes up out of darkness, from the centre outwards
  float iris = smoothstep(0., 1., uReveal * 1.9 - length(p) * .85);
  col *= mix(iris, 1., smoothstep(.75, 1., uReveal)) * smoothstep(0., .35, uReveal);
  // the sky keeps its colours (no film curve), only highlights roll off; deep space keeps the old finish
  if (uEnv > .5) {
    col *= 1. - uTravel;
    vec3 hi = max(col - .8, 0.);
    col = min(col, .8) + .2 * (1. - exp(-hi / .2));
    col = pow(col, vec3(1. / 2.2)) + (h21(fc + fract(uTime) * 61.) - .5) / 255.;
    fragColor = vec4(col, 1.);
  } else {
    fragColor = vec4(finish(col, fc), 1.);
  }
}`;

/* ═════════════════════════ SATURN: Mains ═════════════════════════ */
const SATURN = `
vec3 saturnBands(vec3 sp, float lat) {
  float w = fbm3(sp * vec3(2., 9., 2.) + 4.);
  float y = lat + (w - .5) * .05;
  vec3 c = vec3(.90, .79, .58);
  c = mix(c, vec3(.80, .66, .44), smoothstep(.3, .9, sin(y * 13. + 1.2) * .5 + .5) * .5);
  c = mix(c, vec3(.96, .88, .70), smoothstep(.5, 1., sin(y * 5.5 - .4) * .5 + .5) * .45);
  c = mix(c, vec3(.62, .64, .62), smoothstep(1.0, 1.4, y) * .7);              // the bluish-grey north
  c = mix(c, vec3(.70, .60, .45), smoothstep(-1.0, -1.4, y) * .6);
  return c * (.92 + .16 * fbm3(sp * vec3(6., 46., 6.)));
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - .5 * uRes) / uRes.y / (1. + uTravel * .45);
  vec3 rd = viewRay(p, 4.1);
  vec3 col = realSky(rd) * .7 + starField(rd, .75);

  float R = uSubject.z * (1. + uTravel * .45);
  vec2 q = (fc - uSubject.xy - uPointer * R * .03) / R;
  vec3 L = normalize(vec3(-.62, .3, .72));
  vec3 ax = vec3(0., cos(.42), sin(.42)); ax.xy *= rot(-.38);                  // rings open 24°, rolled across the frame
  float obl = .9;                                                              // Saturn is visibly flattened
  // express the pixel in the planet's own frame to apply the flattening along its axis
  vec3 e1 = normalize(cross(ax, vec3(0, 0, 1))), e2 = cross(ax, e1);
  float zr = -(q.x * ax.x + q.y * ax.y) / ax.z; vec3 rp = vec3(q, zr); float rho = length(rp);
  float rA = 0.; vec3 rC = vec3(0);
  if (rho > 1.2 && rho < 2.36) {
    rA = clamp(ringTau(rho) * 1.2, 0., 1.);
    float bl = dot(rp, L);
    float sh = (bl < 0. && rho * rho - bl * bl < .97) ? .035 : 1.;
    rC = ringColor(rho) * sh * 1.05;
  }
  // sphere, squeezed along its axis
  vec2 qa = vec2(dot(q, normalize(vec2(ax.y, -ax.x))), dot(q, normalize(ax.xy)) / mix(1., obl, length(ax.xy)));
  float d2 = dot(qa, qa);
  if (d2 < 1.) {
    vec3 n = vec3(q, sqrt(max(0., 1. - d2)));
    float lat = asin(clamp(dot(normalize(n), ax), -1., 1.));
    float lon = atan(dot(n, e2), dot(n, e1)) + uTime * .012;
    vec3 sp = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
    vec3 alb = saturnBands(sp, lat);
    float ndl = dot(normalize(n), L), lit = pow(clamp(ndl, 0., 1.), .8);
    float s = -dot(n, ax) / dot(L, ax);
    if (s > 0.) { float rr = length(n + L * s); if (rr > 1.2 && rr < 2.36) lit *= exp(-ringTau(rr) * 2.6); }   // ring shadow on the globe
    vec3 pc = alb * (lit * 1.28 + .008) * mix(.55, 1., pow(n.z, .5));
    pc += vec3(.9, .8, .6) * pow(1. - n.z, 4.) * smoothstep(-.2, .4, ndl) * .25;
    float a = smoothstep(1., 1. - 3. / R, d2);
    if (rA > 0. && zr > n.z) pc = mix(pc, rC, rA);
    col = mix(col, pc, a);
  } else if (rA > 0.) {
    col = mix(col, rC, rA);
  }
  // moons, in the ring plane
  for (int i = 0; i < 3; i++) {
    float fi = float(i), orad = 3.1 + fi * 1.55, ang = uTime * (.02 - fi * .005) + fi * 2.3 + 1.;
    vec3 mp = (e1 * cos(ang) + e2 * sin(ang)) * orad;
    float mr = (i == 1 ? .085 : .04);
    vec2 mq = (q - mp.xy) / mr; float md = dot(mq, mq);
    if (md < 1. && (d2 >= 1. || mp.z > 0.)) {
      vec3 mn = vec3(mq, sqrt(1. - md));
      vec3 mc = (i == 1 ? vec3(.86, .62, .3) : vec3(.86, .86, .84)) * (.8 + .3 * vnoise(mq * 5. + fi));
      col = mix(col, mc * pow(clamp(dot(mn, L), 0., 1.), .8) * 1.2, smoothstep(1., .8, md));
    }
  }
  fragColor = vec4(finish(col, fc), 1.);
}`;

/* ═════════════════════════ JUPITER: Syllabus ═════════════════════════ */
const JUPITER = `
float belt(float y, float c, float w) { return exp(-pow((y - c) / w, 2.)); }
vec3 jupiter(vec3 sp, float t) {
  float lat = asin(sp.y), lon = atan(sp.z, sp.x);
  // each band is a jet stream: neighbours slide past each other (we ride with the Great Red Spot)
  float jet = sin(lat * 17.) * .7 + sin(lat * 6.5 + 1.) * .5;
  float lw = lon + jet * t * .014;
  vec3 pw = vec3(cos(lw) * cos(lat), lat * 1.2, sin(lw) * cos(lat));
  float w1 = fbm3(pw * vec3(2.6, 11., 2.6) + 2.);
  float w2 = fbm3(pw * vec3(7., 34., 7.) + w1 * 2.2);
  float w3 = fbm3(pw * vec3(18., 70., 18.) + w2 * 3.);
  float y = lat + (w1 - .5) * .1 + (w2 - .5) * .045 + (w3 - .5) * .015;
  float b = belt(y, .16, .075) + belt(y, -.21, .085) * .95 + belt(y, .47, .05) * .6 + belt(y, -.52, .055) * .6
          + belt(y, .74, .06) * .45 + belt(y, -.8, .07) * .5 + belt(y, .0, .018) * .35;
  vec3 zone = vec3(.92, .85, .72), brown = vec3(.58, .35, .20), dark = vec3(.34, .20, .13);
  vec3 c = mix(zone, brown, clamp(b * 1.15, 0., 1.));
  c = mix(c, dark, clamp(b - .45, 0., 1.) * smoothstep(.4, .75, w2));
  c = mix(c, zone * 1.04, smoothstep(.55, .8, w3) * (1. - clamp(b, 0., 1.)) * .35);        // bright ammonia cloud in the zones
  c = mix(c, vec3(.60, .66, .74), smoothstep(.62, .85, w2) * belt(y, .08, .035) * .7);     // blue-grey festoons
  c = mix(c, vec3(.56, .52, .5), smoothstep(.95, 1.35, abs(lat)));                          // the poles
  // the Great Red Spot: an anticyclone, with the flow bending round it
  vec2 g = vec2(mod(lon + 1.15 + PI, 2. * PI) - PI, (lat + .385) * 1.75) / .2;
  float gd = length(g);
  if (gd < 2.2) {
    float sw = atan(g.y, g.x) + 2.6 * exp(-gd * gd * 1.3) + t * .05;
    float tex = fbm(vec2(sw * 2., gd * 5.) + 3.);
    vec3 spot = mix(vec3(.78, .36, .20), vec3(.58, .22, .13), tex);
    c = mix(c, spot, smoothstep(1.05, .78, gd) * .93);
    c = mix(c, zone * 1.03, smoothstep(.35, .0, abs(gd - 1.2)) * .5);                      // the pale hollow around it
  }
  // white ovals, strung along the south
  vec2 ov = vec2(mod(lon * 3. + t * .01, 1.2) - .6, (lat + .6) * 3.2) / .2;
  c = mix(c, vec3(.97, .94, .88), smoothstep(1., .6, length(ov)) * .7);
  return c * (.82 + .3 * w2) * (.94 + .12 * w3);
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - .5 * uRes) / uRes.y / (1. + uTravel * .45);
  vec3 rd = viewRay(p, .7);
  vec3 col = realSky(rd) * .6 + starField(rd, .7);
  float R = uSubject.z * (1. + uTravel * .45);
  vec2 q = (fc - uSubject.xy - uPointer * R * .02) / R;
  vec3 L = normalize(vec3(-.5, .42, .76));
  vec3 ax = normalize(vec3(.26, -.93, .25));                                   // south up: the Red Spot sits high in the frame
  vec3 e1 = normalize(cross(ax, vec3(0, 0, 1))), e2 = cross(ax, e1);
  float d2 = dot(q, q);
  // Io and Europa, and the shadows they drop on the cloud tops
  vec3 moonP[2]; float moonR[2];
  for (int i = 0; i < 2; i++) {
    float fi = float(i), ang = uTime * (.03 - fi * .011) + 2.2 + fi * 1.9;
    moonP[i] = (e1 * cos(ang) + e2 * sin(ang)) * (1.55 + fi * .55) + ax * (.05 - fi * .12);
    moonR[i] = .034 - fi * .006;
  }
  if (d2 < 1.) {
    vec3 n = vec3(q, sqrt(1. - d2));
    float lat = asin(clamp(dot(n, ax), -1., 1.)), lon = atan(dot(n, e2), dot(n, e1));
    vec3 alb = jupiter(vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon)), uTime);
    float ndl = dot(n, L), lit = pow(clamp(ndl, 0., 1.), .78);
    for (int i = 0; i < 2; i++) {
      vec3 w = moonP[i] - n; float along = dot(w, L);
      if (along > 0.) lit *= mix(.12, 1., smoothstep(moonR[i] * .8, moonR[i] * 1.5, length(w - L * along)));
    }
    vec3 pc = alb * (lit * 1.3 + .006) * mix(.5, 1., pow(n.z, .55));
    pc += vec3(.95, .8, .6) * pow(1. - n.z, 4.) * smoothstep(-.2, .4, ndl) * .2;
    col = mix(col, pc, smoothstep(1., 1. - 3. / R, d2));
  }
  for (int i = 0; i < 2; i++) {
    vec2 mq = (q - moonP[i].xy) / moonR[i]; float md = dot(mq, mq);
    if (md < 1. && (d2 >= 1. || moonP[i].z > 0.)) {
      vec3 mn = vec3(mq, sqrt(1. - md));
      vec3 mc = i == 0 ? vec3(.92, .82, .45) : vec3(.86, .83, .78);
      col = mix(col, mc * pow(clamp(dot(mn, L), 0., 1.), .8) * 1.25, smoothstep(1., .75, md));
    }
  }
  fragColor = vec4(finish(col, fc), 1.);
}`;

/* ═════════════════════════ EARTH: Progress ═════════════════════════ */
const EARTH_FN = `
uniform sampler2D uEarth;
uniform float uEarthOn;
/* Earth, from NASA's Blue Marble, with computed weather, ocean glint and air. q in radii; returns rgb + coverage. */
vec4 earth(vec2 q, vec3 L, float spin, float px) {
  float d2 = dot(q, q);
  vec3 air = vec3(.30, .56, 1.);
  if (d2 >= 1.) {
    float e = sqrt(d2) - 1.;
    float side = smoothstep(-.5, .5, dot(normalize(vec3(q, 0.)), L));
    float halo = exp(-e * 38.) * side;
    return vec4(air * halo * .9, halo * .8);
  }
  vec3 n = vec3(q, sqrt(1. - d2));
  vec3 ax = normalize(vec3(-.36, .92, .16));                                   // the 23° tilt
  vec3 e1 = normalize(cross(ax, vec3(0, 0, 1))), e2 = cross(ax, e1);
  float lat = asin(clamp(dot(n, ax), -1., 1.)), lon = atan(dot(n, e2), dot(n, e1)) + spin;
  vec2 uv = vec2(fract(lon / (2. * PI) + .5), .5 - lat / PI);
  vec3 day = toLinear(textureLod(uEarth, uv, 0.).rgb) * uEarthOn + vec3(.02, .05, .12) * (1. - uEarthOn);
  float ocean = smoothstep(.0, .05, day.b - day.r * 1.25) * (1. - smoothstep(.3, .6, day.r));
  // weather: fronts and swirls, denser along the storm tracks
  vec3 sp = vec3(cos(lat) * cos(lon + uTime * .004), sin(lat), cos(lat) * sin(lon + uTime * .004));
  float warp = fbm3(sp * 3.4 + 11.);
  float cl = fbm3(sp * vec3(6.5, 9., 6.5) + warp * 2.4) * .65 + fbm3(sp * 19. + warp * 3.) * .35;
  float tracks = .5 + .5 * cos(lat * 5.2) * (1. - smoothstep(1.1, 1.45, abs(lat)));
  float cloud = smoothstep(.56 - tracks * .07, .8, cl) * .9 * uEarthOn;
  float ndl = dot(n, L), lit = smoothstep(-.06, .22, ndl) * clamp(ndl * 1.05 + .05, 0., 1.);
  vec3 col = day * lit * 1.7;
  vec3 hv = normalize(L + vec3(0, 0, 1));
  col += vec3(1., .93, .8) * pow(max(dot(n, hv), 0.), 90.) * ocean * (1. - cloud) * lit * 2.2;   // sun glint on the sea
  col = mix(col, vec3(1.) * (lit * 1.5 + .01), cloud * .92);
  col += air * pow(1. - n.z, 2.6) * smoothstep(-.15, .35, ndl) * .85;                            // the blue limb
  col += vec3(1., .45, .2) * smoothstep(.16, .0, abs(ndl)) * pow(1. - n.z, 1.5) * .1;            // dusk, along the terminator
  col += vec3(.01, .014, .03);                                                                   // night side, by starlight
  return vec4(col, smoothstep(1., 1. - 3. * px, d2));
}
`;
const EARTH = EARTH_FN + `
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - .5 * uRes) / uRes.y / (1. + uTravel * .45);
  vec3 rd = viewRay(p, 5.2);
  vec3 col = realSky(rd) * .55 + starField(rd, .6);
  float R = uSubject.z * (1. + uTravel * .45);
  vec3 L = normalize(vec3(-.66, .26, .7));
  // the Moon, far beyond
  vec2 mq = (fc - uSubject.xy - vec2(-R * 1.9, R * .95) - uPointer * R * .012) / (R * .1); float md = dot(mq, mq);
  if (md < 1.) {
    vec3 mn = vec3(mq, sqrt(1. - md));
    float mare = fbm(mq * 2.2 + 4.), cr = fbm(mq * 9.);
    col = mix(col, vec3(.6, .59, .57) * (.55 + .5 * smoothstep(.35, .6, mare)) * (.8 + .3 * cr) * pow(clamp(dot(mn, L), 0., 1.), .8) * 1.3, smoothstep(1., .85, md));
  }
  vec4 e = earth((fc - uSubject.xy - uPointer * R * .025) / R, L, uTime * .018 + 1.3, 1. / R);
  col = mix(col, e.rgb, e.a);
  fragColor = vec4(finish(col, fc), 1.);
}`;

/* ═════════════════════════ Surface worlds: shared terrain machinery ═════════════════════════ */
const SURFACE = `
/* One scale of impact craters: a bowl, a raised rim, a soft blanket of ejecta. */
float craters(vec2 x, float scale, float seed, float density) {
  vec2 p = x / scale, id = floor(p); float h = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = id + vec2(i, j), r = h22(c + seed);
    if (r.x > density) continue;
    float rad = .16 + .3 * r.y;
    float d = length(p - c - .5 - (h22(c + seed + 5.) - .5) * .6) / rad;
    if (d > 2.4) continue;
    float bowl = (d < 1.) ? (d * d - 1.) * .55 : 0.;
    float rim = .2 * exp(-pow((d - 1.) / .22, 2.));
    h += (bowl + rim + .05 * exp(-max(d - 1., 0.) * 2.5)) * rad * scale;
  }
  return h;
}
/* Small 2D shapes for far-off structures (signed distances, in px). */
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
float sdDome(vec2 p, float r) { return max(length(p) - r, -p.y); }
`;

/* ═════════════════════════ THE MOON: Prelims ═════════════════════════ */
const MOON = EARTH_FN + SURFACE + `
float moonH(vec2 x, float lod) {
  float h = (fbm(x * .04) - .5) * 2.6 + (fbm(x * .2 + 3.) - .5) * .45;
  h += craters(x, 30., 1., .16) * .5;
  h += craters(x, 9., 2., .2) * .45;
  if (lod > .25) h += craters(x, 2.6, 3., .22) * .4;
  if (lod > .5) { vec2 c = floor(x * 2.2), r = h22(c + 4.); float d = length(fract(x * 2.2) - .5 - (r - .5) * .6); h += smoothstep(.13 * r.x, 0., d) * .1 * step(.72, r.y) * lod; }    // boulders
  if (lod > .7 && uLite < .5) { vec2 c = floor(x * 9.), r = h22(c + 8.); float d = length(fract(x * 9.) - .5 - (r - .5) * .6); h += smoothstep(.2 * r.x, 0., d) * .03 * step(.6, r.y) * lod; }  // stones
  return h;
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  float zoom = 1. + uTravel * .45;
  vec2 p = vec2((fc.x - .5 * uRes.x) / uRes.y, (fc.y - uHorizon) / uRes.y) / zoom;
  vec3 L = normalize(vec3(-.66, .46, -.3));                                    // the Sun, mid-morning, from the left
  vec3 col = vec3(0);
  float az = p.x + uPointer.x * .012;
  // distant highlands: rounded massifs on the horizon
  float ridge1 = (fbm(vec2(az * 1.6 + 4., 1.)) - .42) * .12 + .012;
  float ridge2 = (fbm(vec2(az * 3.4 + 9., 5.)) - .46) * .06 + .004;
  float sky = step(max(ridge1, ridge2), p.y);
  if (p.y > 0. && sky > .5) {
    // black sky. In sunlight on the Moon the stars are all but invisible: only a hint remains.
    vec3 rd = normalize(vec3(p.x, p.y + .2, -1.5)); rd.xz *= rot(1.1 + uPointer.x * .01);
    col = starField(rd, .1) + realSky(rd) * .06;
    // Earth, hanging above the horizon
    float R = uSubject.z;
    vec2 eq = (fc - uSubject.xy - uPointer * 5.) / R / zoom;
    vec4 e = earth(eq, normalize(vec3(-.6, .34, .72)), uTime * .014 + 2.6, 1. / R);
    col = mix(col, e.rgb, e.a);
  } else if (p.y > 0.) {
    // the highlands themselves
    bool nearRidge = ridge2 >= p.y;
    float prof = nearRidge ? ridge2 : ridge1;
    float sl = nearRidge ? (fbm(vec2((az + .004) * 3.4 + 9., 5.)) - fbm(vec2((az - .004) * 3.4 + 9., 5.))) * 7.
                         : (fbm(vec2((az + .006) * 1.6 + 4., 1.)) - fbm(vec2((az - .006) * 1.6 + 4., 1.))) * 6.;
    float tex = fbm(vec2(az * 40., p.y * 160.) + (nearRidge ? 0. : 20.));
    float lit = clamp(.62 + sl * 1.1 + (tex - .5) * .35 - (prof - p.y) * 1.6, 0.06, 1.);
    col = vec3(.44, .435, .42) * lit * (nearRidge ? .95 : 1.05);
  } else {
    // the regolith underfoot, out to the horizon
    vec3 rd = normalize(vec3(p.x, p.y, -1.5));
    float camH = 2.1, t = camH / -rd.y;
    vec2 x = rd.xz * t + vec2(uPointer.x * .25, 0.);
    float lod = clamp(1.4 - t / 26., 0., 1.);
    float e = .02 + t * .012;
    float h0 = moonH(x, lod);
    vec3 n = normalize(vec3(h0 - moonH(x + vec2(e, 0.), lod), e * 1.3, h0 - moonH(x + vec2(0., e), lod)));
    float ndl = dot(n, L);
    float lit = smoothstep(-.04, .16, ndl) * pow(clamp(ndl * 1.7, 0., 1.), .55);     // regolith scatters light back towards the sun
    float alb = .30 + .12 * fbm(x * .25) + .06 * fbm(x * 2.4) * lod;
    alb *= .9 + .2 * h21(floor(x * 90.)) * lod * lod;                                // grains
    col = vec3(alb, alb * .985, alb * .95) * lit * 1.35;
    col *= smoothstep(-.001, -.012, p.y) * .25 + .75;
    // a research outpost on the plain
    vec2 b = fc - vec2(uRes.x * .5 + (uSubject.x - uRes.x * .5) * .35, uHorizon - uRes.y * .03);
    float s = uRes.y / 900.; b /= s;
    float dome = min(sdDome(b - vec2(-34., 0.), 15.), sdDome(b - vec2(8., 0.), 22.));
    float hab = min(sdBox(b - vec2(52., 5.), vec2(20., 5.)), sdBox(b - vec2(-78., 4.), vec2(16., 4.)));
    float mast = min(sdBox(b - vec2(92., 22.), vec2(.9, 22.)), length(b - vec2(92., 45.)) - 3.5);
    float st = min(min(dome, hab), mast);
    if (st < 0.) {
      float shade = clamp(.62 - (b.x - (dome < 0. ? (b.x > -13. ? 8. : -34.) : b.x)) * .034, .08, 1.);
      col = vec3(.9, .9, .88) * shade * (dome < 0. ? 1. : .8);
      if (hab < 0. && abs(b.y - 5.) < 1.5 && fract(b.x * .11) > .55) col = vec3(1., .82, .5) * 1.4;   // lit ports
    } else {
      // long shadows, away from the sun
      float sx = b.x - b.y * -7.;
      float sh = min(min(sdBox(vec2(b.x + b.y * 5. - 8., b.y + 3.), vec2(70., 2.5)), sdBox(vec2(b.x + b.y * 5. - 150., b.y + 3.), vec2(40., 1.2))), 1e3);
      if (b.y < 0. && b.y > -7. && b.x > -40. && b.x < 250.) col *= mix(.25, 1., smoothstep(-1., 2., sh));
    }
  }
  fragColor = vec4(finish(col, fc), 1.);
}`;

/* ═════════════════════════ MARS: Notes ═════════════════════════ */
const MARS = SURFACE + `
float marsH(vec2 x, float lod) {
  float h = (fbm(x * .035) - .5) * 3. + (fbm(x * .16 + 7.) - .5) * .8;
  // wind ripples, marching with the prevailing wind
  h += sin(x.x * 2.6 + x.y * 1.1 + fbm(x * .35) * 5.) * .035 * lod * smoothstep(.35, .6, fbm(x * .09 + 2.));
  h += (fbm(x * .6 + 11.) - .5) * .12 * lod;
  // scattered rock
  if (lod > .2) { vec2 c = floor(x * 1.9), r = h22(c + 4.); float d = length(fract(x * 1.9) - .5 - (r - .5) * .6); h += smoothstep(.1 * r.x, 0., d) * .09 * step(.7, r.y) * lod; }
  if (lod > .55 && uLite < .5) { vec2 c = floor(x * 7.), r = h22(c + 8.); float d = length(fract(x * 7.) - .5 - (r - .5) * .6); h += smoothstep(.16 * r.x, 0., d) * .03 * step(.62, r.y) * lod; }
  return h;
}
vec3 marsSky(vec2 p, vec2 sun) {
  float e = clamp(p.y, 0., 1.);
  vec3 c = mix(vec3(.80, .50, .33), vec3(.30, .17, .14), pow(e * 2.1, .62));          // dust-laden air: butterscotch, deepening overhead
  c = mix(c, vec3(.11, .07, .08), smoothstep(.22, .62, e));
  float d = length((p - sun) * vec2(1., 1.25));
  c += vec3(.42, .62, 1.) * exp(-d * 6.5) * .9;                                       // forward-scattered light: the sunset on Mars is blue
  c += vec3(.8, .9, 1.) * exp(-d * 34.) * 1.6;
  c += vec3(1.) * smoothstep(.0085, .0055, d) * 5.;                                    // the Sun, two-thirds the size it is from Earth
  c += vec3(.9, .55, .35) * exp(-e * 16.) * .18;                                       // haze on the horizon
  return c;
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  float zoom = 1. + uTravel * .45;
  vec2 p = vec2((fc.x - .5 * uRes.x) / uRes.y, (fc.y - uHorizon) / uRes.y) / zoom;
  vec2 sun = vec2(-.34 - uPointer.x * .004, .075);
  vec3 L = normalize(vec3(-.6, .2, -.77));
  vec3 haze = vec3(.74, .47, .31);
  float az = p.x + uPointer.x * .01;
  vec3 col;
  // three ranges of distant terrain: far mountains, mesas, a near rise
  float r1 = (fbm(vec2(az * 1.1 + 1., 2.)) - .4) * .16 + .01;
  float m = fbm(vec2(az * 2.1 + 6., 4.));
  float r2 = (smoothstep(.42, .56, m) * .06 + (m - .5) * .03) + .004 - abs(az - .2) * .01;       // flat-topped mesas
  float r3 = (fbm(vec2(az * 4.4 + 2., 8.)) - .5) * .035 + .001;
  if (p.y > max(r1, max(r2, r3))) {
    col = marsSky(p, sun);
  } else if (p.y > 0.) {
    float layer = p.y <= r3 ? 2. : (p.y <= r2 ? 1. : 0.);
    float prof = layer > 1.5 ? r3 : (layer > .5 ? r2 : r1);
    float tex = fbm(vec2(az * (30. + layer * 30.), p.y * (120. + layer * 80.)) + layer * 13.);
    float strata = sin((p.y - prof) * 900. + tex * 6.) * .5 + .5;                                 // layered rock in the mesa walls
    float lit = clamp(.42 + (tex - .5) * .7 + (layer > .5 && layer < 1.5 ? strata * .16 : 0.) - (prof - p.y) * 3., .05, 1.);
    vec3 rock = mix(vec3(.50, .24, .14), vec3(.66, .36, .2), tex) * lit;
    col = mix(rock, haze * .92, layer < .5 ? .78 : (layer < 1.5 ? .52 : .26));                    // air thickens with distance
    col = mix(col, marsSky(vec2(p.x, max(prof, .001)), sun) * .9, layer < .5 ? .25 : 0.);
  } else {
    vec3 rd = normalize(vec3(p.x, p.y, -1.5));
    float camH = 1.9, t = camH / -rd.y;
    vec2 x = rd.xz * t + vec2(uPointer.x * .2 + 40., 0.);
    float lod = clamp(1.4 - t / 22., 0., 1.);
    float e = .02 + t * .012;
    float h0 = marsH(x, lod);
    vec3 n = normalize(vec3(h0 - marsH(x + vec2(e, 0.), lod), e * 1.25, h0 - marsH(x + vec2(0., e), lod)));
    float ndl = dot(n, L);
    float lit = smoothstep(-.03, .12, ndl) * clamp(ndl * 2.4, 0., 1.);
    float v = fbm(x * .22), fine = fbm(x * 2.6);
    vec3 alb = mix(vec3(.52, .22, .11), vec3(.70, .37, .19), v);
    alb = mix(alb, vec3(.30, .16, .12), smoothstep(.66, .82, fine) * lod * .45);                  // dark basalt
    alb *= .9 + .2 * h21(floor(x * 60.)) * lod * lod;
    col = alb * (lit * vec3(1.15, .98, .86) * 1.25 + vec3(.34, .19, .13) * .42);                   // low sun, plus light from the sky
    float fog = 1. - exp(-t * .028);
    col = mix(col, haze, fog);
    // dust, lifted and carried by the wind
    float dust = fbm(vec2(x.x * .12 - uTime * .035, x.y * .05 + uTime * .006)) * fbm(vec2(x.x * .5 - uTime * .08, x.y * .2));
    col = mix(col, haze * 1.08, smoothstep(.2, .55, dust) * .32 * smoothstep(3., 26., t));
    // the research station, on the plain towards the mesas
    vec2 b = fc - vec2(uRes.x * .5 + (uSubject.x - uRes.x * .5) * .5, uHorizon - uRes.y * .022);
    float s = uRes.y / 900.; b /= s;
    float dome = min(sdDome(b - vec2(0., 0.), 20.), sdDome(b - vec2(-46., 0.), 13.));
    float hab = min(sdBox(b - vec2(46., 5.), vec2(22., 5.)), sdBox(b - vec2(86., 3.5), vec2(12., 3.5)));
    float mast = min(sdBox(b - vec2(-74., 17.), vec2(.9, 17.)), sdBox(b - vec2(-74., 30.), vec2(7., .9)));
    float pan = sdBox(vec2(b.x - 130. - b.y * .8, b.y - 3.), vec2(20., 2.));
    float st = min(min(dome, hab), min(mast, pan));
    if (st < 0.) {
      float cx = dome < 0. ? (b.x > -23. ? 0. : -46.) : b.x;
      float shade = clamp(.66 - (b.x - cx) * .03 + b.y * .008, .12, 1.);
      vec3 body = pan < 0. ? vec3(.10, .14, .26) : vec3(.84, .76, .68);
      col = mix(body * shade * vec3(1.08, .95, .86), haze, .2);
      if (hab < 0. && abs(b.y - 5.5) < 1.6 && fract(b.x * .12) > .5) col = vec3(1., .78, .42) * 1.5;   // lit ports
    } else if (b.y < 0. && b.y > -8. && b.x > -60. && b.x < 300.) {
      float sh = sdBox(vec2(b.x + b.y * 6.5 - 30., b.y + 3.5), vec2(80., 3.));
      col *= mix(.45, 1., smoothstep(-1., 3., sh));
    }
  }
  fragColor = vec4(finish(col, fc), 1.);
}`;

export const FRAGMENT = {
  cosmos: COMMON + COSMOS,
  saturn: COMMON + SATURN,
  jupiter: COMMON + JUPITER,
  earth: COMMON + EARTH,
  moon: COMMON + MOON,
  mars: COMMON + MARS,
};
export type ShaderName = keyof typeof FRAGMENT;
