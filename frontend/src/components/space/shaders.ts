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

/* ═════════════════════════ DEEP SPACE: landing, the exam systems, search, sign-in, the admin station ═════════════════════════
 *
 * Always night, always deep space: survey stars (twinkling), drifting nebulae, dust lanes, star clusters,
 * the great galaxy and far ones; now and then a shooting star, a meteor or a comet. The examinations
 * are glass spheres holding their official emblems: the glass turns, the emblem keeps facing you. */
const SKYLIB = `
uniform float uGalaxy;        // how much of the great galaxy is in view
uniform vec2 uGalaxyAt;       // where it sits, in view units
uniform sampler2D uE0, uE1, uE2;
uniform vec3 uEmblemOn;       // each emblem texture fades in once loaded
uniform float uClock;         // seconds, from the real clock: when events happen
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
/* distant star clusters: a soft glow resolved into many faint stars */
vec3 clusters(vec3 rd) {
  vec3 p = rd * 6., id = floor(p);
  if (h31(id + 77.) < .88) return vec3(0);
  vec3 c = id + .5 + (h33(id + 5.) - .5) * .5;
  float d = length(p - c), r = .05 + .08 * h31(id + 8.);
  float glow = exp(-d * d / (r * r));
  vec3 tint = mix(vec3(1., .9, .75), vec3(.75, .85, 1.), h31(id + 12.));
  return tint * (glow * .05 + starLayer(rd, 520., .82) * glow * 2.4);
}
float segment(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0., 1.);
  return length(pa - ba * h);
}
vec4 rnd4(float s, float k) { return vec4(h21(vec2(s, k)), h21(vec2(s, k + 3.7)), h21(vec2(s, k + 7.1)), h21(vec2(s, k + 11.3))); }

/* Shooting stars (common, faint, quick) and meteors (rare, bright, sometimes breaking up).
   Time is cut into slots; whether a slot has one, where and which way it goes, all come from the slot's number. */
vec3 meteors(vec2 fc) {
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
      float ang = (r2.z < .5 ? 3.55 : 4.95) + .7 * r2.w;
      vec2 dir = vec2(cos(ang), sin(ang));
      float run = (kind == 0 ? .22 + .12 * r.w : .42) * uRes.y;
      vec2 head = start + dir * run * age;
      float trail = (kind == 0 ? .08 : .17) * uRes.y * smoothstep(0., .3, age);
      float h, d = segment(fc, head - dir * trail, head, h);
      float wpx = (kind == 0 ? .8 : 1.5) * u;
      float fade = sin(3.14159 * pow(age, .8));
      float g = exp(-d * d / (wpx * wpx)) * pow(h, 2.4) * fade;
      g += exp(-dot(fc - head, fc - head) / (wpx * wpx * 9.)) * fade * (kind == 0 ? .5 : 1.4);
      vec3 tint = kind == 0 ? vec3(.86, .92, 1.) : mix(vec3(1., .74, .45), vec3(.62, 1., .74), step(.62, r.w));
      acc += tint * g * (kind == 0 ? .7 + 1.3 * r.y : 3.2);
      if (kind == 1 && r.w > .4 && age > .58) {
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
  return acc;
}

/* A comet: rare; drifts across the sky over a few minutes, its tails streaming away from the light. */
vec3 comet(vec2 fc) {
  float slot = 540., s = floor(uClock / slot);
  vec4 r = rnd4(s, 71.);
  if (r.x > .5) return vec3(0);
  float dur = 220., t0 = s * slot + r.y * (slot - dur);
  float age = (uClock - t0) / dur;
  if (age < 0. || age > 1.) return vec3(0);
  vec2 a = vec2(.12 + .3 * r.z, .62 + .3 * r.w) * uRes, b = a + vec2(.32 * (r.z < .5 ? 1. : -1.), -.12) * uRes.x;
  vec2 pos = mix(a, b, age);
  vec2 star = vec2(-.4, 1.4) * uRes;                                            // the light it falls towards, beyond the top left
  vec2 away = normalize(pos - star);
  float u = uRes.y / 900.;
  float bright = smoothstep(0., .15, age) * smoothstep(1., .82, age) * (.85 + .15 * sin(uClock * .7 + r.w * 9.));
  vec2 q = fc - pos;
  float along = dot(q, away), across = dot(q, vec2(-away.y, away.x));
  float len = .2 * uRes.y;
  float dust = along > 0. ? exp(-across * across / pow(3. * u + along * .16, 2.)) * exp(-along / len * 2.2) : 0.;
  float ion = along > 0. ? exp(-across * across / pow(1.2 * u + along * .03, 2.)) * exp(-along / len * 1.4) : 0.;
  float coma = exp(-dot(q, q) / pow(7. * u, 2.)), nucleus = exp(-dot(q, q) / pow(1.6 * u, 2.));
  vec3 c = vec3(1., .95, .84) * dust * .55 + vec3(.55, .78, 1.) * ion * .5 + vec3(.8, .95, 1.) * coma * .7 + vec3(1.) * nucleus * 2.2;
  return c * bright;
}

vec4 emblemTex(float slot, vec2 uv) {
  vec4 c = slot < .5 ? texture(uE0, uv) : slot < 1.5 ? texture(uE1, uv) : texture(uE2, uv);
  float on = slot < .5 ? uEmblemOn.x : slot < 1.5 ? uEmblemOn.y : uEmblemOn.z;
  return vec4(toLinear(c.rgb), c.a * on);
}

`;

const COSMOS = SKYLIB + `
uniform int uOrbN;
uniform vec4 uOrb[6];         // x, y (px, y up), radius, hover
uniform vec4 uOrbA[6];        // colour A, kind
uniform vec4 uOrbB[6];        // colour B, ring
uniform float uOrbE[6];       // emblem texture slot (0..2), or -1 for a computed planet
/* An examination's sphere: a glass orb that turns on a tilted axis, its official emblem held inside,
   facing the viewer with a gentle sway so it can always be read. Tint = the commission's colour. */
vec4 emblemSphere(vec2 q, float slot, vec3 tint, float hover, float seed, vec3 L) {
  float d2 = dot(q, q);
  if (d2 > 1.) {
    float e = sqrt(d2) - 1.;                                                       // a soft halo, brighter when approached
    float halo = exp(-e * 16.) * (.18 + .3 * hover);
    return vec4(mix(tint, vec3(1.), .5) * halo, halo);
  }
  vec3 n = vec3(q, sqrt(1. - d2));
  float t = uTime;
  // the emblem: an inner medallion that sways a little (yaw and pitch), never turning away
  float yaw = sin(t * .31 + seed) * (.2 + .16 * hover), pitch = sin(t * .23 + seed * 1.7) * .07;
  vec3 m = n;
  m.xz *= rot(yaw); m.yz *= rot(pitch);
  float k = .84;                                                                   // the medallion sits in the flatter middle of the face
  vec2 uv = vec2(.5 + m.x / (2. * k), .5 - m.y / (2. * k));
  vec4 em = emblemTex(slot, clamp(uv, 0., 1.));                                  // sampled everywhere (smooth mipmaps), then masked
  em.a *= smoothstep(.25, .42, m.z) * step(max(abs(uv.x - .5), abs(uv.y - .5)), .5);
  // the glass behind the emblem: deep tinted space with a slow inner glow that turns
  vec3 ax = normalize(vec3(.22, .95, .2));
  vec3 e1 = normalize(cross(ax, vec3(0, 0, 1))), e2 = cross(ax, e1);
  float spin = t * (.12 + .05 * fract(seed));
  float lat = asin(clamp(dot(n, ax), -1., 1.)), lon = atan(dot(n, e2), dot(n, e1)) + spin;
  vec3 sp = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  float swirl = fbm3(sp * 2.6 + seed);
  vec3 inner = toLinear(tint) * (.18 + .55 * swirl) * (.45 + .55 * max(dot(n, L), 0.));
  float ndl = max(dot(n, L), 0.);
  vec3 lit = em.rgb * (.88 + .28 * ndl);                                           // the emblem stays true and bright: legible on its shaded side too
  vec3 col = mix(inner, lit, em.a);
  // the shell: etched meridians and parallels that turn with the glass, Fresnel rim, two highlights
  float grid = smoothstep(.035, .0, abs(fract(lon * 12. / 6.28318) - .5) * 2. - .96) + smoothstep(.04, .0, abs(fract(lat * 6. / 3.14159 + .5) - .5) * 2. - .95);
  col += vec3(.85, .9, 1.) * grid * .045 * (1. - em.a);
  float fres = pow(1. - n.z, 3.2);
  col = mix(col, toLinear(tint) * .9 + vec3(.08), fres * .55 * (1. - em.a * .85)); // the tinted rim never veils the emblem
  vec3 h = normalize(L + vec3(0, 0, 1));
  col += vec3(1.) * (pow(max(dot(n, h), 0.), 160.) * 1.4 * (1. - em.a * .55) + pow(max(dot(n, h), 0.), 14.) * .045); // a sharp highlight (softer over the emblem), a faint sheen
  col += mix(tint, vec3(.7, .85, 1.), .5) * pow(1. - n.z, 2.) * smoothstep(-.3, .4, -dot(n.xy, L.xy)) * (.25 + .35 * hover);  // rim light from behind
  col *= mix(mix(.72, .9, em.a), 1., smoothstep(-.6, .5, dot(n, L)));              // its night side (gentler across the emblem)
  col *= 1. + hover * .18;
  return vec4(col, smoothstep(1., .985, d2));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - .5 * uRes) / uRes.y / (1. + uTravel * .45);
  float u = uRes.y / 900.;
  vec3 rd = viewRay(p, 2.3);

  // ── the deep sky, layer behind layer ──
  vec3 col = realSky(rd) * 1.1 + starField(rd, 1.);
  float band = smoothstep(.0, .09, dot(col, vec3(.3)));
  vec3 drift = vec3(uTime * .0021, 0., uTime * .0013);
  float neb = fbm3(rd * 2.4 + drift + fbm3(rd * 3.6 - drift) * 1.1);
  col += (vec3(.5, .13, .2) * smoothstep(.52, .9, neb) + vec3(.07, .2, .26) * smoothstep(.56, .9, fbm3(rd * 3.1 + 7. + drift))) * (.05 + band * .3);
  float dust = fbm3(rd * 1.7 + vec3(3., 1., 7.) + drift * .5);
  col *= 1. - .38 * smoothstep(.5, .78, dust) * band;                                // dark dust lanes across the bright band
  col += vec3(.16, .09, .06) * smoothstep(.55, .8, dust) * band * .08;
  vec3 rv = normalize(vec3(p, -1.55)); rv.yz *= rot(uPointer.y * .012); rv.xz *= rot(uPointer.x * .018);
  col += galaxy(rv) * uGalaxy;
  if (uLite < .5) col += farGalaxies(rd) + clusters(rd);

  // ── now and then ──
  if (uEvents > .5) {
    col += meteors(fc);
    col += comet(fc);
  }

  // ── the examinations ──
  vec3 L = normalize(vec3(-.55, .45, .72));
  for (int i = 0; i < 6; i++) {
    if (i >= uOrbN) break;
    vec4 o = uOrb[i];
    if (o.z < 1.) continue;
    float fi = float(i), sd = fi * 7.3 + 1.7;
    float R = o.z * (1. + uTravel * .45);
    // each drifts on a small orbit of its own, slowly enough to keep the gateway where it is
    vec2 c = o.xy + uPointer * o.z * .06 + vec2(cos(uTime * (.11 + .03 * fi) + sd), sin(uTime * (.14 + .02 * fi) + sd)) * R * .035;
    if (uOrbE[i] > -.5) {
      // its orbit: a tilted ellipse, with a small moon going round at its own pace (behind the sphere on the far side)
      mat2 tl = rot(-.2 + .12 * fi);
      vec2 rel = (fc - c) * tl;
      float a = 1.55 * R, b = .36 * R;
      float e = length(vec2(rel.x / a, rel.y / b));
      float line = 1. - smoothstep(0., 1.3, abs(e - 1.) / max(fwidth(e), 1e-4));
      bool far = rel.y > 0.;
      bool hidden = far && dot(fc - c, fc - c) < R * R;
      if (!hidden) col += mix(uOrbA[i].rgb, vec3(.8, .88, 1.), .6) * line * (far ? .1 : .2) * (1. + o.w * 1.6);
      float th = uTime * (.42 - .09 * fi) + sd;
      vec2 mpos = c + vec2(cos(th) * a, sin(th) * b) * transpose(tl);
      bool mfar = sin(th) > 0.;
      vec2 mq = (fc - mpos) / (R * .075);
      float m2 = dot(mq, mq);
      if (m2 < 1. && !(mfar && dot(fc - c, fc - c) < R * R)) {
        vec3 mn = vec3(mq, sqrt(1. - m2));
        col = mix(col, vec3(.75, .76, .8) * (max(dot(mn, L), 0.) * 1.3 + .04), smoothstep(1., .8, m2));
      }
      vec4 sph = emblemSphere((fc - c) / R, uOrbE[i], uOrbA[i].rgb, o.w, sd, L);
      col = mix(col, sph.rgb, sph.a);
      if (m2 < 1. && !mfar) {
        vec3 mn = vec3(mq, sqrt(1. - m2));
        col = mix(col, vec3(.75, .76, .8) * (max(dot(mn, L), 0.) * 1.3 + .04), smoothstep(1., .8, m2));
      }
    } else {
      vec2 q = (fc - c) / R;
      float spin = uTime * (uOrbA[i].w < .5 ? .055 : .022) * (1. + .15 * fi) + fi;
      vec4 pl = planet(q, uOrbA[i].w, uOrbA[i].rgb, uOrbB[i].rgb, uOrbB[i].w, sd, spin, L);
      pl.rgb *= 1. + o.w * .35;
      col = mix(col, pl.rgb, pl.a);
    }
  }

  // the opening: space comes up out of darkness, from the centre outwards
  float iris = smoothstep(0., 1., uReveal * 1.9 - length(p) * .85);
  col *= mix(iris, 1., smoothstep(.75, 1., uReveal)) * smoothstep(0., .35, uReveal);
  fragColor = vec4(finish(col, fc), 1.);
}`;

/* ═════════════════════════ SATURN: Mains ═════════════════════════ */
const GIANTS = `
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
`;

const SATURN = GIANTS + `
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
    vec2 gi = floor(rp.xy * 700.);                                              // sunlight glinting off single blocks of ice
    rC += vec3(1., .97, .9) * step(.997, h21(gi)) * (.5 + .5 * sin(uTime * 2.5 + h21(gi + 3.) * 40.)) * sh * 1.2;
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
  for (int i = 0; i < 5; i++) {
    float fi = float(i), orad = 2.7 + fi * 1.2, ang = uTime * (.022 - fi * .003) + fi * 2.3 + 1.;
    vec3 mp = (e1 * cos(ang) + e2 * sin(ang)) * orad;
    float mr = (i == 1 ? .085 : i == 3 ? .05 : .03);
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
const JUPITER = GIANTS + `
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
  vec3 moonP[4]; float moonR[4];
  for (int i = 0; i < 4; i++) {                                               // Io, Europa, Ganymede, Callisto
    float fi = float(i), ang = uTime * (.03 / (1. + fi * .9)) + 2.2 + fi * 1.9;
    moonP[i] = (e1 * cos(ang) + e2 * sin(ang)) * (1.55 + fi * .62) + ax * (.05 - fi * .07);
    moonR[i] = i == 0 ? .034 : i == 1 ? .029 : i == 2 ? .05 : .045;
  }
  if (d2 < 1.) {
    vec3 n = vec3(q, sqrt(1. - d2));
    float lat = asin(clamp(dot(n, ax), -1., 1.)), lon = atan(dot(n, e2), dot(n, e1));
    vec3 alb = jupiter(vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon)), uTime);
    float ndl = dot(n, L), lit = pow(clamp(ndl, 0., 1.), .78);
    for (int i = 0; i < 4; i++) {
      vec3 w = moonP[i] - n; float along = dot(w, L);
      if (along > 0.) lit *= mix(.12, 1., smoothstep(moonR[i] * .8, moonR[i] * 1.5, length(w - L * along)));
    }
    vec3 pc = alb * (lit * 1.3 + .006) * mix(.5, 1., pow(n.z, .55));
    pc += vec3(.95, .8, .6) * pow(1. - n.z, 4.) * smoothstep(-.2, .4, ndl) * .2;
    col = mix(col, pc, smoothstep(1., 1. - 3. / R, d2));
  }
  for (int i = 0; i < 4; i++) {
    vec2 mq = (q - moonP[i].xy) / moonR[i]; float md = dot(mq, mq);
    if (md < 1. && (d2 >= 1. || moonP[i].z > 0.)) {
      vec3 mn = vec3(mq, sqrt(1. - md));
      vec3 mc = i == 0 ? vec3(.92, .82, .45) : i == 1 ? vec3(.86, .83, .78) : i == 2 ? vec3(.62, .58, .52) : vec3(.42, .38, .34);
      mc *= .85 + .3 * vnoise(mq * 3. + float(i) * 5.);
      col = mix(col, mc * pow(clamp(dot(mn, L), 0., 1.), .8) * 1.25, smoothstep(1., .75, md));
    }
  }
  fragColor = vec4(finish(col, fc), 1.);
}`;

/* ═════════════════════════ EARTH: Progress ═════════════════════════ */
const EARTH_FN = `
uniform sampler2D uEarth;
uniform float uEarthOn;
uniform sampler2D uNight;     // NASA Black Marble: the night-side lights
uniform float uNightOn;
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
  vec3 city = toLinear(textureLod(uNight, uv, 0.).rgb) * uNightOn;
  col += city * vec3(1., .82, .55) * smoothstep(.06, -.14, ndl) * (1. - cloud * .85) * 2.2;       // cities, where it is night
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
  vec2 eq = (fc - uSubject.xy - uPointer * R * .025) / R;
  vec4 e = earth(eq, L, uTime * .018 + 1.3, 1. / R);
  col = mix(col, e.rgb, e.a);
  // satellites on their orbits, catching the Sun (and vanishing into Earth's shadow)
  for (int k = 0; k < 4; k++) {
    float fk = float(k), ang = uTime * (.045 - fk * .007) + fk * 2.1;
    vec3 ax = normalize(vec3(.35 - fk * .3, 1., .25 + fk * .2));
    vec3 a1 = normalize(cross(ax, vec3(0, 0, 1))), a2 = cross(ax, a1);
    vec3 sp = (a1 * cos(ang) + a2 * sin(ang)) * (1.07 + fk * .045);
    if (sp.z < 0. && dot(sp.xy, sp.xy) < 1.) continue;                         // behind the planet
    float al = dot(sp, L);
    float sunlit = (al < 0. && length(sp - L * al) < 1.) ? 0. : 1.;
    vec2 sq = (eq - sp.xy) * R;
    vec2 pd = rot(.5 + fk * .7) * sq;
    float g = exp(-dot(sq, sq) / 1.6) * 1.5 + exp(-pd.y * pd.y / .35) * smoothstep(6.5, 3., abs(pd.x)) * .55;
    col += vec3(1., .94, .82) * g * sunlit * (k == 0 ? 1.4 : .8);
  }
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
    // an orbiter crossing the black sky, its solar wings catching the Sun
    vec2 oc = vec2(-1. + fract(uTime * .005 + .3) * 2., .34 + .03 * sin(uTime * .02));
    vec2 oq = (p - oc) * uRes.y;
    float ob = exp(-dot(oq, oq) / 2.) * 1.6 + exp(-oq.y * oq.y / .5) * smoothstep(7., 4., abs(oq.x)) * .6;
    col += vec3(1., .86, .6) * ob * smoothstep(-.02, .02, oc.y - max(ridge1, ridge2));
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
    float ru = x.x + 1.2 + x.y * -.22 - sin(x.y * .09) * 1.1;                        // a rover's tracks, curving away
    alb *= 1. - .3 * smoothstep(.1, .04, abs(abs(ru) - .45)) * (.7 + .3 * step(.5, fract(x.y * 7.))) * smoothstep(0., .3, lod);
    col = vec3(alb, alb * .985, alb * .95) * lit * 1.35;
    col *= smoothstep(-.001, -.012, p.y) * .25 + .75;
    // a research outpost on the plain
    vec2 b = fc - vec2(uRes.x * .5 + (uSubject.x - uRes.x * .5) * .35, uHorizon - uRes.y * .03);
    float s = uRes.y / 900.; b /= s;
    float dome = min(sdDome(b - vec2(-34., 0.), 15.), sdDome(b - vec2(8., 0.), 22.));
    float hab = min(sdBox(b - vec2(52., 5.), vec2(20., 5.)), sdBox(b - vec2(-78., 4.), vec2(16., 4.)));
    float mast = min(sdBox(b - vec2(92., 22.), vec2(.9, 22.)), length(b - vec2(92., 45.)) - 3.5);
    // a lander on its four legs, in gold foil
    vec2 lb = b - vec2(-150., 0.);
    float lander = min(sdBox(lb - vec2(0., 13.), vec2(10., 5.5)), min(sdBox(vec2(abs(lb.x) - 11. + lb.y * .35, lb.y - 4.), vec2(.8, 4.5)), sdBox(lb - vec2(3., 21.), vec2(.6, 3.))));
    float st = min(min(dome, hab), mast);
    if (lander < 0.) {
      col = vec3(.95, .74, .32) * clamp(.75 - lb.x * .04 + lb.y * .01, .15, 1.2);
      if (abs(lb.y - 13.) < 5.5 && abs(lb.x) < 10. && fract(lb.x * .2 + lb.y * .1) > .8) col *= .75;  // the foil's creases
    } else if (st < 0.) {
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
    // Phobos and Deimos: small and lumpy, lit from the Sun's side, seen through the dusty air
    for (int m = 0; m < 2; m++) {
      vec2 mc = m == 0 ? vec2(.17 - uPointer.x * .004, .27) : vec2(.5 - uPointer.x * .003, .38);
      float mr = m == 0 ? .017 : .0075;
      vec2 mq = (p - mc) / mr;
      mq.x *= m == 0 ? .8 : .9;
      float lump = 1. + (vnoise(mq * 1.4 + float(m) * 7.) - .5) * .3;
      float d = length(mq) / lump;
      if (d < 1.) {
        vec3 n = normalize(vec3(mq / lump, sqrt(max(1. - d * d, 0.))));
        float lit = clamp(dot(n, normalize(vec3(-.92, .05, .38))), 0., 1.);
        vec3 mcol = vec3(.56, .48, .42) * (.7 + .5 * vnoise(mq * 4. + 3.)) * (lit * 1.7 + .06);
        col = mix(col, mix(mcol, col, .3), smoothstep(1., .88, d));
      }
    }
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
    // a rover's tracks, from underfoot out towards the station
    float ru = x.x - 40.6 + x.y * .3 - sin(x.y * .11) * 1.4;
    float rut = smoothstep(.13, .05, abs(abs(ru) - .55)) * (.75 + .25 * step(.5, fract(x.y * 5.)));
    alb *= 1. - .32 * rut * smoothstep(0., .3, lod);
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

/* ═════════════════════════ THE SOLAR SYSTEM: the home page ═════════════════════════
 *
 * Ray-traced, per pixel, from a camera Universe.tsx places (see solar.ts for where everything is):
 * the Sun (granulation, spots, limb darkening, prominences, corona), eight planets, the Moon and
 * Pluto as lit spheres with their own surfaces, axes and spin; Saturn's and Uranus's rings with the
 * shadows they cast and receive; the asteroid and Kuiper belts; every orbit as a fine line; and
 * beyond Pluto, on tracks of their own, the examinations' spheres with their official emblems.
 * Body i: 0 Sun · 1 Mercury · 2 Venus · 3 Earth · 4 Moon · 5 Mars · 6 Jupiter · 7 Saturn · 8 Uranus
 *         9 Neptune · 10 Pluto · 11… the examinations */
const SOLAR = SKYLIB + GIANTS + EARTH_FN + `
#define NB 14
#define NO 12
uniform vec3 uCamPos, uCamR, uCamU, uCamF;
uniform float uFocal;          // px
uniform vec2 uCenter;          // where the camera looks, px (y up)
uniform int uNB;
uniform vec4 uB[NB];           // centre, radius
uniform vec4 uAx[NB];          // spin axis, spin angle
uniform float uHov[NB];
uniform int uNO;
uniform vec4 uOC[NO];          // ellipse centre, semi-major axis
uniform vec4 uOU[NO];          // towards perihelion, semi-minor axis
uniform vec4 uON[NO];          // orbit pole, the body's eccentric anomaly (-100: a fixed track)
uniform float uOH[NO];         // highlight
uniform float uOK[NO];         // 0 planet, 1 dwarf planet, 2 an examination's track
uniform float uES[3];          // the examinations' emblem slots
uniform vec3 uET[3];           // and their colours
uniform vec4 uDeep[5];         // beyond the system: Andromeda, a nebula, a black hole, a ring nebula, a pulsar (px, y up; size px; angle)
uniform float uDeepH[5];       // pointed at
uniform float uSys;            // how strongly the system shows over the sky (the home page keeps it faint and far)

/* The Andromeda Galaxy, seen as it is from here: a great spiral tipped 77° from face-on, a yellow core,
   blue arms with pink star-forming knots, dark dust lanes on the near side, and its companions M32 and M110. */
vec3 andromeda(vec2 fc) {
  vec4 d = uDeep[0];
  if (d.z < 1.) return vec3(0);
  vec2 q = (fc - d.xy) * rot(d.w) / d.z;
  if (dot(q, q) > 2.4) return vec3(0);
  vec2 g = vec2(q.x, q.y / .3);                                    // the disc, deprojected
  float r = length(g), th = atan(g.y, g.x);
  float n = fbm(g * 4. + 2.), n2 = fbm(g * 12. + n * 2.);
  float phase = th * 2. - log(r + .04) * 4.6;
  float arm = pow(.5 + .5 * cos(phase + (n - .5) * 1.4), 2.);
  float disc = exp(-r * 3.1), bulge = exp(-dot(q * vec2(1., 1.7), q * vec2(1., 1.7)) * 46.);
  vec3 c = vec3(1., .86, .62) * bulge * 2.4 + vec3(1., .9, .78) * disc * .5;
  c += vec3(.58, .72, 1.) * disc * arm * (.4 + 1.4 * n2) * 1.25;
  c += vec3(1., .42, .55) * disc * arm * smoothstep(.66, .82, n2) * 1.3;
  float lane = pow(.5 + .5 * cos(phase + 1.05 + (n2 - .5) * 1.2), 7.) * smoothstep(.12, .35, r);
  c *= 1. - lane * (g.y < 0. ? .8 : .35);
  c *= smoothstep(1.5, .55, r) * (.88 + .24 * h21(fc));
  vec2 m32 = q - vec2(.1, -.13);
  c += vec3(1., .9, .74) * exp(-dot(m32, m32) * 1300.) * 1.1;
  vec2 m110 = (q - vec2(-.3, .3)) * rot(.7);
  c += vec3(1., .9, .78) * exp(-(m110.x * m110.x * 110. + m110.y * m110.y * 520.)) * .45;
  return c * .6 * (1. + uDeepH[0] * .4);
}
/* A stellar nursery: hydrogen glowing red, oxygen teal near the hot young stars, cut by dark dust. */
vec3 nebulaCloud(vec2 fc) {
  vec4 d = uDeep[1];
  if (d.z < 1.) return vec3(0);
  vec2 q = (fc - d.xy) / d.z;
  float r = length(q);
  if (r > 1.5) return vec3(0);
  float t = uTime * .004;
  float w = fbm(q * 2.1 + 4. + t), n = fbm(q * 3.4 + w * 1.7 - t);
  vec3 c = mix(vec3(.16, .62, .68), vec3(.92, .2, .32), smoothstep(.25, .75, r + (w - .5) * .7));
  c *= smoothstep(.4, .85, n) * smoothstep(1.45, .15, r);
  c *= 1. - smoothstep(.56, .74, fbm(q * 4.2 + 9. + w)) * .85;                        // dust pillars
  c += vec3(.85, .92, 1.) * exp(-r * r * 14.) * .16;                                  // the young cluster lighting it
  return c * .3 * (1. + uDeepH[1] * .6);
}
/* Gravitational lensing: the sky seen near a black hole comes from nearer its centre, so stars are pushed outwards. */
vec2 lensed(vec2 fc) {
  vec4 d = uDeep[2];
  if (d.z < 1.) return fc;
  vec2 v = fc - d.xy; float r = max(length(v), 1e-3);
  return fc - v / r * (d.z * d.z * 2.2 / max(r, d.z));
}
/* A black hole: the shadow, the thin photon ring, the accretion disc crossing in front, and the disc's far
   side bent over the top and under the bottom; the side turning towards us is brighter. rgb, shadow. */
vec4 blackHole(vec2 fc) {
  vec4 d = uDeep[2];
  if (d.z < 1.) return vec4(0);
  vec2 q = (fc - d.xy) * rot(d.w) / d.z;
  float r = length(q);
  if (r > 7.) return vec4(0);
  vec3 hot = vec3(1., .62, .26);
  vec2 e = vec2(q.x, q.y / .17); float er = length(e);
  float flow = fbm(vec2(atan(e.y, e.x) * 3. - uTime * .7, er * 2.5));
  float disc = smoothstep(1.45, 1.8, er) * smoothstep(4.6, 2.4, er);
  vec3 discC = mix(hot, vec3(1., .94, .8), smoothstep(3.2, 1.6, er)) * disc * (.45 + .9 * flow) * (1. - .6 * e.x / max(er, 1.));
  float halo = smoothstep(1.06, 1.3, r) * smoothstep(2.3, 1.35, r) * smoothstep(.1, .7, abs(q.y) / r);
  vec3 haloC = mix(hot, vec3(1., .9, .7), .4) * halo * (.35 + .55 * fbm(vec2(atan(q.y, q.x) * 3. - uTime * .5, r * 4.))) * (1. - .45 * q.x / r);
  vec3 ring = vec3(1., .86, .62) * exp(-pow((r - 1.05) / .03, 2.)) * 1.3;
  float shadow = smoothstep(1.03, .97, r);
  vec3 c = (haloC + ring) * (1. - shadow);
  if (e.y < 0. || r > 1.) c += discC;                                                 // the near half of the disc passes in front
  return vec4(c * (1. + uDeepH[2] * .35), shadow);
}
/* A planetary nebula: a glowing shell, red at the edge and blue-green within, round a white dwarf. */
vec3 ringNebula(vec2 fc) {
  vec4 d = uDeep[3];
  if (d.z < 1.) return vec3(0);
  vec2 q = (fc - d.xy) * rot(d.w) / d.z; q.x *= .8;
  float r = length(q);
  if (r > 2.) return vec3(0);
  float n = fbm(q * 3. + 5.);
  float shell = exp(-pow((r - .72 - (n - .5) * .22) / .24, 2.));
  vec3 c = mix(vec3(.25, .62, .95), vec3(1., .32, .26), smoothstep(.5, .95, r)) * shell * (.55 + .7 * n);
  c += vec3(.3, .6, .8) * exp(-r * r * 4.) * .2 + vec3(1.) * exp(-r * r * 500.) * 1.5;
  return c * .8 * (1. + uDeepH[3] * .5);
}
/* A pulsar: a point of light sweeping two beams round, flashing as one points our way, in a faint wind nebula. */
vec3 pulsar(vec2 fc) {
  vec4 d = uDeep[4];
  if (d.z < 1.) return vec3(0);
  vec2 q = (fc - d.xy) / d.z;
  if (dot(q, q) > 30.) return vec3(0);
  float ang = uTime * 1.4;
  vec2 dir = normalize(vec2(cos(ang), sin(ang) * .4));
  float along = dot(q, dir), across = abs(q.x * dir.y - q.y * dir.x);
  float beam = exp(-across * across / (.002 + along * along * .012)) * exp(-abs(along) * 1.1);
  float flash = .55 + .45 * pow(abs(cos(ang)), 10.);
  vec3 c = vec3(.62, .76, 1.) * beam * .9 * flash + vec3(.86, .92, 1.) * exp(-dot(q, q) * 160.) * 2. * flash;
  c += vec3(.5, .42, .85) * exp(-dot(q, q) * .9) * fbm(q * 3. + 2.) * .12;
  return c * (1. + uDeepH[4] * .5);
}

vec2 hitSphere(vec3 ro, vec3 rd, vec4 s) {                 // (distance to closest approach, miss distance)
  vec3 oc = ro - s.xyz; float b = dot(oc, rd);
  return vec2(-b, sqrt(max(dot(oc, oc) - b * b, 0.)));
}
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.) return sqrt(dot(p - vec2(.25, .75), p - vec2(.25, .75))) - .35355;
  vec2 a = p - vec2(0., 1.), b = p - .5 * max(p.x + p.y, 0.);
  return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y);
}
/* A body's own frame: latitude/longitude on its surface, turning with it. */
vec3 bodyFrame(vec3 n, vec4 ax, out float lat, out float lon) {
  vec3 a = ax.xyz, ref = abs(a.y) < .9 ? vec3(0, 1, 0) : vec3(0, 0, 1);
  vec3 e1 = normalize(cross(a, ref)), e2 = cross(a, e1);
  lat = asin(clamp(dot(n, a), -1., 1.));
  lon = atan(dot(n, e2), dot(n, e1)) - ax.w;
  return vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
}

/* The Sun's face: granulation, supergranules, a few spots, limb darkening. */
vec3 sunFace(vec3 n, vec3 rd) {
  float lat, lon; vec3 sp = bodyFrame(n, uAx[0], lat, lon);
  float g = vnoise3(sp * 70. + uTime * .06) * .6 + vnoise3(sp * 150. - uTime * .09) * .4;
  float sg = fbm3(sp * 9. + 3.);
  float spot = smoothstep(.76, .84, fbm3(sp * 3.2 + 17.)) * smoothstep(.75, .35, abs(lat));
  float mu = clamp(dot(n, -rd), 0., 1.);
  vec3 c = mix(vec3(1., .36, .08), vec3(1., .8, .5), pow(mu, .7));          // a warmer, whiter centre; deep orange limb
  c *= (.66 + .5 * g) * (.86 + .28 * sg);
  c *= 1. - spot * .8 * (.7 + .3 * g);
  c *= .3 + .7 * pow(mu, .45);
  return c * 1.2;
}
/* The corona, streamers and prominences, around the disc (x = miss distance in solar radii). */
vec3 sunAura(vec3 w, float x) {
  float ang = atan(dot(w, uCamU), dot(w, uCamR));
  float streak = fbm(vec2(ang * 2.4 + 3., uTime * .01)) * .7 + .3;
  float e = max(x - 1., 0.);
  vec3 c = vec3(1., .66, .36) * (exp(-e * 8.) * .38 + exp(-e * 2.2) * .08 * streak) + vec3(1., .8, .58) * .016 / (x * x);
  float pr = fbm(vec2(ang * 7., e * 10. - uTime * .03) + 5.);
  c += vec3(1., .3, .12) * smoothstep(.6, .78, pr) * smoothstep(.16, .0, e) * step(1., x) * 1.4;
  return c;
}

/* The planets' surfaces (albedo, linear), and the colour of their air. */
vec3 surface(int i, vec3 n, out vec3 air, out float airK) {
  float lat, lon; vec3 sp = bodyFrame(n, uAx[i], lat, lon);
  air = vec3(0); airK = 0.;
  if (i == 1) {                                                     // Mercury: grey, cratered, scorched
    float h = fbm3(sp * 2.6 + 1.), c = fbm3(sp * 11. + 4.);
    vec3 a = mix(vec3(.30, .28, .26), vec3(.62, .58, .54), h) * (.75 + .4 * c);
    return a + vec3(.25) * smoothstep(.72, .8, fbm3(sp * 6. + 9.));
  }
  if (i == 2) {                                                     // Venus: a lid of sulphuric cloud
    float w = fbm3(sp * vec3(2., 4.5, 2.) + vec3(uTime * .006, 0., 0.));
    float c = fbm3(sp * vec3(3.4, 8., 3.4) + w * 2.2);
    air = vec3(1., .82, .5); airK = .55;
    return mix(vec3(.78, .6, .34), vec3(.98, .9, .72), c) * (.9 + .1 * sin(lat * 5. + w * 4.));
  }
  if (i == 3) {                                                     // Earth: NASA's Blue Marble, with weather
    vec2 uv = vec2(fract(lon / (2. * PI) + .5), .5 - lat / PI);
    vec3 day = toLinear(textureLod(uEarth, uv, 1.).rgb) * uEarthOn + vec3(.03, .07, .17) * (1. - uEarthOn);
    float cl = fbm3(sp * vec3(5., 8., 5.) + fbm3(sp * 3. + 11.) * 2.);
    float cloud = smoothstep(.55, .78, cl) * .85 * uEarthOn;
    air = vec3(.3, .55, 1.); airK = 1.;
    return mix(day * 1.35, vec3(.92), cloud);
  }
  if (i == 4) {                                                     // the Moon: highlands and maria
    float m = smoothstep(.5, .62, fbm3(sp * 2.2 + 4.));
    return mix(vec3(.62, .6, .58), vec3(.3, .29, .28), m) * (.82 + .3 * fbm3(sp * 9.));
  }
  if (i == 5) {                                                     // Mars: rust, dark basalt, white poles
    float d = fbm3(sp * 2.2 + 7.), f = fbm3(sp * 8. + 2.);
    vec3 a = mix(vec3(.74, .38, .2), vec3(.56, .27, .14), smoothstep(.45, .6, f));
    a = mix(a, vec3(.3, .18, .13), smoothstep(.52, .64, d) * smoothstep(1.1, .5, abs(lat)));
    a = mix(a, vec3(.4, .2, .13), smoothstep(.05, .0, abs(lat + .14 + (f - .5) * .08)) * step(-1.2, lon) * step(lon, -.2) * .7);  // Valles Marineris
    air = vec3(1., .66, .5); airK = .3;
    return mix(a, vec3(.95, .93, .9), smoothstep(1.2, 1.32, abs(lat) + (f - .5) * .2));
  }
  if (i == 6) { air = vec3(.95, .8, .6); airK = .25; return jupiter(sp, uTime); }
  if (i == 7) { air = vec3(.95, .85, .6); airK = .25; return saturnBands(sp, lat); }
  if (i == 8) {                                                     // Uranus: pale cyan methane haze
    float b = fbm3(sp * vec3(1.5, 10., 1.5) + 3.);
    air = vec3(.6, .9, 1.); airK = .7;
    return mix(vec3(.55, .8, .84), vec3(.7, .9, .92), b * .6 + smoothstep(.9, 1.4, lat) * .4);
  }
  if (i == 9) {                                                     // Neptune: deep blue, bands, a dark spot, bright streaks
    float w = fbm3(sp * vec3(2., 9., 2.) + 6.);
    vec3 a = mix(vec3(.14, .27, .74), vec3(.26, .44, .9), smoothstep(.3, .8, sin(lat * 9. + w * 3.) * .5 + .5));
    vec2 g = vec2(mod(lon + 2.2 + PI, 2. * PI) - PI, (lat + .35) * 1.6) / .2;
    a = mix(a, vec3(.06, .12, .4), smoothstep(1., .6, length(g)) * .8);
    a = mix(a, vec3(.92, .95, 1.), smoothstep(.72, .82, fbm3(sp * vec3(3., 22., 3.) + 2.)) * .7);
    air = vec3(.4, .6, 1.); airK = .7;
    return a;
  }
  // Pluto: tan and rust, the dark Cthulhu belt, and the bright nitrogen heart, Tombaugh Regio
  float f = fbm3(sp * 6. + 3.);
  vec3 a = mix(vec3(.56, .46, .38), vec3(.78, .7, .6), fbm3(sp * 2.5 + 1.)) * (.85 + .3 * f);
  float cth = smoothstep(.2, .0, abs(lat + .12 + (f - .5) * .2)) * smoothstep(.2, -.5, lon);
  a = mix(a, vec3(.28, .14, .1), cth * .85);
  float hd = sdHeart(vec2(lon - .25, lat + .5) / .95);
  float heart = smoothstep(.04, -.04, hd + (f - .5) * .08);
  a = mix(a, mix(vec3(.93, .9, .85), vec3(.99, .97, .94), step(lon, .25)), heart);
  air = vec3(.6, .7, 1.); airK = .15;
  return a;
}

/* An examination's emblem, shown flat: the official artwork on its white enamel disc, facing you, with
   the commission's colour as a fine rim. It turns only a little (a slow sway), so it is always legible.
   n and the lights are in view space: z towards you. */
vec3 examSphere(vec3 n, int k, float hov, vec3 Ls, float hero) {
  float slot = uES[k];
  float sway = sin(uTime * .09 + float(k) * 1.7) * .22 + hov * .16;
  vec3 m = n;
  m.xz *= rot(sway);
  vec2 uv = vec2(.5 + m.x / (2. * .62), .5 - m.y / (2. * .62));
  vec4 em = emblemTex(slot, clamp(uv, 0., 1.));
  if (slot < -.5) em.a = 0.;
  em.a *= smoothstep(1., .985, length(uv - .5) * 2.);
  vec3 Lk = normalize(vec3(-.5, .55, .68));
  float diff = max(dot(n, Lk), 0.) * .6 + .4;
  vec3 disc = vec3(.94, .93, .9) * diff;
  vec3 col = mix(disc, em.rgb * (.9 + .25 * diff), em.a);
  float rim = smoothstep(.97, .995, length(vec2(n.x, n.y)));
  col = mix(col, toLinear(uET[k]) * (.5 + .5 * diff), rim * .9);
  col += vec3(1.) * pow(max(dot(n, normalize(Lk + vec3(0, 0, 1))), 0.), 60.) * .12 * (1. - em.a);
  return col * (1. + hov * .12);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  float zt = 1. + uTravel * .45;
  vec2 p = (fc - .5 * uRes) / uRes.y / zt;

  // ── the deep sky, held back so the system leads (seen through the black hole's lens) ──
  vec3 sd = viewRay((lensed(fc) - .5 * uRes) / uRes.y / zt, 2.3);
  vec3 col = realSky(sd) * .8 + starField(sd, .85);
  float band = smoothstep(.0, .09, dot(col, vec3(.3)));
  vec3 drift = vec3(uTime * .0021, 0., uTime * .0013);
  float neb = fbm3(sd * 2.4 + drift + fbm3(sd * 3.6 - drift) * 1.1);
  col += (vec3(.5, .13, .2) * smoothstep(.52, .9, neb) + vec3(.07, .2, .26) * smoothstep(.56, .9, fbm3(sd * 3.1 + 7. + drift))) * (.04 + band * .24);
  float dust = fbm3(sd * 1.7 + vec3(3., 1., 7.) + drift * .5);
  col *= 1. - .38 * smoothstep(.5, .78, dust) * band;
  if (uLite < .5) col += farGalaxies(sd) + clusters(sd);
  // ── beyond the Solar System ──
  col += (nebulaCloud(fc) * .28 + andromeda(fc) * .5 + ringNebula(fc) * .6 + pulsar(fc) * .4);   // far, and quiet
  vec4 bh = blackHole(fc);
  col = col * (1. - bh.a) + bh.rgb * .6;
  if (uEvents > .5) { col += meteors(fc) * .7; col += comet(fc) * .45; }   // now and then, and quietly

  // ── the system ──
  vec3 skyCol = col;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamR * (fc.x - uCenter.x) / zt + uCamU * (fc.y - uCenter.y) / zt + uCamF * uFocal);
  float tNear = 1e9;
  for (int i = 0; i < NB; i++) {                                   // what is solidly in front, pixel by pixel
    if (i >= uNB) break;
    if (uB[i].w <= 0.) continue;
    vec2 h = hitSphere(ro, rd, uB[i]);
    float px = h.x / uFocal;
    if (h.x > 0. && h.y < uB[i].w - px * .5) tNear = min(tNear, h.x - sqrt(max(uB[i].w * uB[i].w - h.y * h.y, 0.)));
  }

  // the Sun's light in the space around it
  vec2 hs = hitSphere(ro, rd, uB[0]);
  float xs = hs.y / uB[0].w;
  if (hs.x < tNear + 1e-3) col += sunAura(ro + rd * hs.x - uB[0].xyz, xs) * (1. + uHov[0] * .25);

  // the belts, in the plane of the ecliptic
  float tb = -ro.y / rd.y;
  if (tb > 0. && tb < tNear) {
    vec3 bp = ro + rd * tb; float r = length(bp.xz), pxw = tb / uFocal;
    for (int belt = 0; belt < 2; belt++) {
      float r0 = belt == 0 ? 6.45 : 15.9, r1 = belt == 0 ? 7.55 : 19.;
      if (r < r0 || r > r1) continue;
      float edge = smoothstep(r0, r0 + .35, r) * smoothstep(r1, r1 - .35, r);
      float ang = atan(-bp.z, bp.x) - uTime * (belt == 0 ? .012 : .002);
      float sc = belt == 0 ? 10. : 6.;
      vec2 g = vec2(ang * r * sc, r * sc), id = floor(g), hh = h22(id + float(belt) * 17.);
      vec3 rock = belt == 0 ? mix(vec3(.5, .44, .38), vec3(.78, .7, .6), hh.y) : mix(vec3(.62, .68, .78), vec3(.9, .92, 1.), hh.y);
      col += (belt == 0 ? vec3(.5, .42, .34) * .006 : vec3(.4, .46, .6) * .002) * edge;        // fine dust
      if (hh.x > (belt == 0 ? .5 : .7)) {
        vec2 cc = id + .2 + .6 * h22(id + 3.1);
        float size = (.012 + .05 * pow(hh.y, 5.)) * (belt == 0 ? 1. : .8);
        float d = length(g - cc) / sc, rad = max(size, pxw * .75);
        float a = smoothstep(rad, rad * .45, d) * pow(size / rad, 1.4) * edge;
        col = mix(col, rock * (belt == 0 ? .8 : .5), clamp(a * 1.1, 0., 1.));
      }
    }
  }

  // the orbits: fine lines, brighter where a body has just passed and when it is pointed at
  for (int k = 0; k < NO; k++) {
    if (k >= uNO) break;
    vec3 N = uON[k].xyz, U = uOU[k].xyz, V = cross(N, U);
    float t = dot(uOC[k].xyz - ro, N) / dot(rd, N);
    vec3 q3 = ro + rd * t - uOC[k].xyz;
    vec2 q = vec2(dot(q3, U) / uOC[k].w, dot(q3, V) / uOU[k].w);
    float F = length(q) - 1.;
    float line = 1. - smoothstep(.0, 1.25, abs(F) / max(fwidth(F), 1e-6));
    if (t <= 0. || t >= tNear || line <= 0.) continue;
    float kind = uOK[k], hl = uOH[k], ang = atan(q.y, q.x);
    vec3 lc; float a;
    if (kind > 1.5) {                                               // an examination's track: gold
      lc = vec3(1., .8, .5); a = (.16 + .6 * hl) * smoothstep(-.45, .25, (ro + rd * t).z / uOC[k].w);
    } else {
      float behind = mod(uON[k].w - ang, 2. * PI);
      float trail = exp(-behind * 2.2);
      lc = kind > .5 ? vec3(.8, .72, 1.) : vec3(.6, .72, 1.);
      a = (.075 + .3 * trail + .5 * hl);
      if (kind > .5) a *= .45 + .55 * step(.42, fract(ang * 36. / (2. * PI)));   // Pluto's: dashed, a different kind of path
    }
    a *= mix(.35, 1., smoothstep(-.7, .2, (ro + rd * t).z / uOC[k].w));   // the far side recedes
    col += lc * line * a * .5;
  }

  // the bodies themselves
  for (int i = 0; i < NB; i++) {
    if (i >= uNB) break;
    vec4 s = uB[i];
    if (s.w <= 0.) continue;
    vec2 h = hitSphere(ro, rd, s);
    float px = h.x / uFocal;
    float cov = clamp((s.w - h.y) / px + .5, 0., 1.);
    float tHit = h.x - sqrt(max(s.w * s.w - h.y * h.y, 0.));
    if (h.x <= 0. || cov <= 0. || tHit > tNear + px * 2.) {
      // a soft halo round a body that is pointed at, and round the examinations
      if (i >= 11 && h.x > 0. && h.x < tNear + s.w) {
        float e = (h.y - s.w) / s.w;
        if (e > 0.) col += mix(toLinear(uET[i - 11]), vec3(1.), .55) * exp(-e * 9.) * (.14 + .4 * uHov[i]);
      } else if (i > 0 && h.x > 0. && h.x < tNear) {
        float e = (h.y - s.w) / max(s.w, px * 3.);
        if (e > 0.) col += vec3(.75, .85, 1.) * exp(-e * 5.) * .35 * uHov[i];
      }
      continue;
    }
    vec3 hp = ro + rd * tHit;
    vec3 n = h.y < s.w ? normalize(hp - s.xyz) : normalize(ro + rd * h.x - s.xyz);
    vec3 L = normalize(uB[0].xyz - hp);
    vec3 c;
    if (i == 0) {
      c = sunFace(n, rd) * (1. + uHov[0] * .1);
    } else if (i >= 11) {
      vec3 nv = vec3(dot(n, uCamR), dot(n, uCamU), -dot(n, uCamF));
      vec3 Lv = vec3(dot(L, uCamR), dot(L, uCamU), -dot(L, uCamF));
      c = examSphere(nv, i - 11, uHov[i], Lv, 0.);
    } else {
      vec3 air; float airK;
      vec3 alb = surface(i, n, air, airK);
      float ndl = dot(n, L);
      float lit = pow(clamp(ndl, 0., 1.), .8);
      if (i == 7) {                                                 // the rings' shadow on Saturn
        vec3 ax = uAx[7].xyz; float sr = s.w;
        float k = -dot(n * sr, ax) / dot(L, ax);
        if (k > 0.) { float rr = length(n * sr + L * k) / sr; if (rr > 1.2 && rr < 2.36) lit *= exp(-ringTau(rr) * 2.2); }
      }
      if (i == 3 || i == 4) {                                       // eclipses: the Moon's shadow on Earth, Earth's on the Moon
        vec4 o = uB[i == 3 ? 4 : 3]; vec3 w = o.xyz - hp; float al = dot(w, L);
        if (al > 0.) lit *= smoothstep(o.w * .8, o.w * 1.3, length(w - L * al));
      }
      c = alb * (lit * 1.3 + .025);
      if (i == 3) {                                                 // sun glint on the sea, city light on the night side
        vec3 hv = normalize(L - rd);
        c += vec3(1., .9, .75) * pow(max(dot(n, hv), 0.), 60.) * lit * .6;
      }
      float mu = clamp(dot(n, -rd), 0., 1.);
      c += air * airK * pow(1. - mu, 3.) * smoothstep(-.25, .35, ndl) * .7;
      c *= 1. + uHov[i] * .3;
    }
    col = mix(col, c, cov);
  }

  // rings: Saturn's (bright, broad) and Uranus's (faint, narrow, standing on edge)
  for (int j = 0; j < 2; j++) {
    int i = j == 0 ? 7 : 8;
    vec4 s = uB[i]; vec3 ax = uAx[i].xyz;
    if (s.w <= 0.) continue;
    float tr = dot(s.xyz - ro, ax) / dot(rd, ax);
    if (tr <= 0. || tr >= tNear) continue;
    vec3 rp = ro + rd * tr - s.xyz;
    float rho = length(rp) / s.w;
    float tau = j == 0 ? (smoothstep(1.22, 1.32, rho) * smoothstep(1.56, 1.5, rho) * .18 + smoothstep(1.5, 1.6, rho) * smoothstep(1.98, 1.92, rho) * .9
                         + smoothstep(1.99, 2.06, rho) * smoothstep(2.3, 2.22, rho) * .6)                          // C, B and A, softened: here they are a few pixels wide
                       : (smoothstep(.012, .0, abs(rho - 1.64)) * .3 + smoothstep(.016, .0, abs(rho - 1.79)) * .3 + smoothstep(.03, .0, abs(rho - 2.0)) * .8) * .5;
    if (tau <= 0.) continue;
    vec3 L = normalize(uB[0].xyz - (s.xyz + rp));
    float bb = dot(rp, L), sh = (bb < 0. && dot(rp, rp) - bb * bb < s.w * s.w) ? .06 : 1.;   // the planet's shadow across the ring
    vec3 rc = (j == 0 ? ringColor(rho) : vec3(.6, .66, .7)) * sh * (1.2 + uHov[i] * .3);
    col = mix(col, rc, clamp(tau, 0., 1.) * (j == 0 ? 1. : .8));
  }

  col = mix(skyCol, col, uSys);                                     // far away: a faint presence, never the subject

  float iris = smoothstep(0., 1., uReveal * 1.9 - length(p) * .85);
  col *= mix(iris, 1., smoothstep(.75, 1., uReveal)) * smoothstep(0., .35, uReveal);
  fragColor = vec4(finish(col, fc), 1.);
}`;


export const FRAGMENT = {
  cosmos: COMMON + COSMOS,
  solar: COMMON + SOLAR,
  saturn: COMMON + SATURN,
  jupiter: COMMON + JUPITER,
  earth: COMMON + EARTH,
  moon: COMMON + MOON,
  mars: COMMON + MARS,
};
export type ShaderName = keyof typeof FRAGMENT;
