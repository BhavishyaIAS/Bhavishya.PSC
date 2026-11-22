"""
Builds public/space/moon-map.webp: an equirectangular map of the Moon (longitude -180..180 left to right,
latitude +90..-90 top to bottom, the near side's centre in the middle), used by components/MoonPhase.tsx.
Red = albedo, green = relief (0.5 = datum), blue = albedo.

It is computed, not photographed (no lunar imagery could be fetched where this was built), but from real
selenography: the maria and the named craters are at their IAU positions and sizes, the bright ray systems
of Tycho, Copernicus, Kepler, Aristarchus and Proclus radiate from where they are, and a crater population
heavier in the highlands than on the maria fills in the rest. Rerun: python3 frontend/scripts/moon-map.py
"""
import numpy as np
from PIL import Image

W, H = 1024, 512
rng = np.random.default_rng(1969)
lat = np.radians(np.linspace(90, -90, H, endpoint=False) - 90 / H)[:, None] * np.ones((1, W))
lon = np.radians(np.linspace(-180, 180, W, endpoint=False) + 180 / W)[None, :] * np.ones((H, 1))
X, Y, Z = np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)


def noise3(x, y, z, seed):
    """Value noise on the sphere (seamless in longitude)."""
    g = np.random.default_rng(seed).random(256 ** 1 * 4096)
    def h(i, j, k):
        return g[(i * 73856093 ^ j * 19349663 ^ k * 83492791) % g.size]
    xi, yi, zi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64), np.floor(z).astype(np.int64)
    xf, yf, zf = x - xi, y - yi, z - zi
    u, v, w = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf), zf * zf * (3 - 2 * zf)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wt = (u if dx else 1 - u) * (v if dy else 1 - v) * (w if dz else 1 - w)
                out = out + wt * h(xi + dx, yi + dy, zi + dz)
    return out


def fbm(scale, seed, octaves=5):
    s, a, f = 0, 0.5, scale
    for o in range(octaves):
        s = s + a * noise3(X * f + 37, Y * f + 11, Z * f + 5, seed + o)
        a, f = a * 0.5, f * 2.03
    return s


def dist(la, lo):
    """Angular distance (degrees) of every map pixel from (la, lo)."""
    la, lo = np.radians(la), np.radians(lo)
    c = np.sin(lat) * np.sin(la) + np.cos(lat) * np.cos(la) * np.cos(lon - lo)
    return np.degrees(np.arccos(np.clip(c, -1, 1)))


def bearing(la, lo):
    la, lo = np.radians(la), np.radians(lo)
    return np.arctan2(np.sin(lon - lo) * np.cos(lat), np.cos(la) * np.sin(lat) - np.sin(la) * np.cos(lat) * np.cos(lon - lo))


albedo = 0.6 + (fbm(2.2, 1) - 0.5) * 0.16 + (fbm(9, 2) - 0.5) * 0.08
height = (fbm(1.6, 3) - 0.5) * 0.12

# ── the maria: (name, lat, lon, radius °, N–S stretch) ──
MARIA = [
    ("Imbrium", 32.8, -15.6, 18.5, 1.0), ("Serenitatis", 28.0, 17.5, 11.5, 1.0), ("Tranquillitatis", 8.5, 31.4, 13.5, 1.0),
    ("Crisium", 17.0, 59.1, 8.6, 0.85), ("Fecunditatis", -7.8, 51.3, 12.5, 1.35), ("Nectaris", -15.2, 35.5, 5.6, 1.0),
    ("Nubium", -21.3, -16.6, 11.0, 1.0), ("Humorum", -24.4, -38.6, 6.4, 1.0), ("Vaporum", 13.3, 3.6, 4.0, 1.0),
    ("Cognitum", -10.0, -23.0, 6.5, 1.0), ("Insularum", 7.5, -30.9, 8.5, 1.0),
    # Oceanus Procellarum: the great irregular dark plain down the west, as a chain of overlapping basins
    ("Procellarum 1", 42.0, -48.0, 9.0, 1.0), ("Procellarum 2", 30.0, -57.0, 11.0, 1.2), ("Procellarum 3", 17.0, -60.0, 11.5, 1.2),
    ("Procellarum 4", 4.0, -55.0, 10.5, 1.2), ("Procellarum 5", -6.0, -46.0, 8.0, 1.0), ("Procellarum 6", 20.0, -44.0, 9.0, 1.0),
    ("Procellarum 7", -1.0, -66.0, 7.0, 1.3), ("Sinus Iridum", 45.0, -31.5, 4.8, 1.0),
    ("Sinus Medii", 2.4, 1.7, 3.2, 1.0), ("Sinus Aestuum", 10.9, -8.8, 3.6, 1.0), ("Smythii", 1.3, 87.5, 6.0, 1.0),
    ("Marginis", 13.3, 86.1, 5.0, 1.0), ("Australe", -38.9, 93.0, 7.5, 1.0), ("Spumans", 1.1, 65.1, 2.3, 1.0),
    ("Undarum", 6.8, 68.4, 3.0, 1.0), ("Moscoviense", 27.3, 147.9, 4.5, 1.0), ("Orientale", -19.4, -92.8, 3.5, 1.0),
    ("Ingenii", -33.7, 163.5, 3.0, 1.0),
]
edge = (fbm(9, 6) - 0.5) * 5 + (fbm(24, 7) - 0.5) * 2.5
mare = np.zeros((H, W))
# the maria's shores are irregular: measure distances on a warped sphere (lobes, bays, peninsulas)
latw = lat + (fbm(1.8, 21) - 0.5) * 0.22 + (fbm(6, 23) - 0.5) * 0.06
lonw = lon + ((fbm(1.8, 22) - 0.5) * 0.22 + (fbm(6, 24) - 0.5) * 0.06) / np.maximum(np.cos(lat), 0.2)
for name, la, lo, r, stretch in MARIA:
    d = np.degrees(np.arccos(np.clip(np.sin(latw) * np.sin(np.radians(la)) + np.cos(latw) * np.cos(np.radians(la)) * np.cos(lonw - np.radians(lo)), -1, 1)))
    b = bearing(la, lo)
    d = d / np.sqrt((np.cos(b) / stretch) ** 2 + np.sin(b) ** 2)  # stretched along N–S
    mare = np.maximum(mare, np.clip((r * 1.16 + edge - d) / 3.4, 0, 1))  # a little generous: the real maria run into one another
# Mare Frigoris: a long band across the north
for k in range(12):  # Mare Frigoris: a long, narrow band of small overlapping basins across the north
    lo_k = -44 + k * 8.2
    la_k = 56 + 3.5 * np.sin(k * 1.3)
    d = dist(la_k, lo_k)
    mare = np.maximum(mare, np.clip((5.6 + edge * 0.6 - d) / 3, 0, 1))
tone = (fbm(4, 5) - 0.5) + (fbm(16, 8) - 0.5) * 0.5
albedo = albedo * (1 - mare) + (0.25 + tone * 0.1) * mare
height = height - mare * 0.015

# ── craters: the named ones, then a population (fewer on the maria) ──
NAMED = [  # lat, lon, radius °, young (rays / bright), dark floor
    (-43.3, -11.4, 1.4, 1, 0), (9.6, -20.1, 1.55, 1, 0), (8.1, -38.0, 0.55, 1, 0), (23.7, -47.4, 0.65, 1, 0),
    (16.1, 46.8, 0.45, 1, 0), (51.6, -9.4, 1.65, 0, 1), (-5.2, -68.6, 2.8, 0, 1), (-58.4, -14.4, 3.8, 0, 0),
    (-9.3, -1.9, 2.5, 0, 0), (-11.4, 26.4, 1.65, 0, 0), (-8.9, 60.9, 2.2, 0, 0), (-25.1, 60.4, 2.9, 0, 0),
    (29.7, -4.0, 1.4, 0, 0), (-16.4, 26.9, 1.3, 0, 0), (-13.4, -3.1, 1.6, 0, 0), (-11.8, -16.7, 1.6, 0, 0),
    (-29.1, -9.0, 1.3, 0, 0), (49.6, 26.3, 1.4, 0, 0), (-31.7, -6.2, 1.2, 0, 0),
]
pop = []
for _ in range(4200):
    la = np.degrees(np.arcsin(rng.uniform(-1, 1)))
    lo = rng.uniform(-180, 180)
    r = 0.22 * (1 - rng.random()) ** -0.62
    r = min(r, 6.0)
    pop.append((la, lo, r, 1 if rng.random() < 0.06 else 0, 0))
ix_lat = lambda la: int((90 - la) / 180 * H)
for (la, lo, r, young, dark) in NAMED + pop:
    i0 = ix_lat(la)
    if not NAMED.count((la, lo, r, young, dark)):
        if mare[min(H - 1, max(0, i0)), int((lo + 180) / 360 * W) % W] > 0.5 and rng.random() < 0.75:
            continue
    span = r * 3.2 + (40 if young and r > 0.4 and (la, lo, r, young, dark) in NAMED else 0)
    r0, r1 = max(0, ix_lat(la + span)), min(H, ix_lat(la - span) + 1)
    sl = slice(r0, r1)
    d = np.degrees(np.arccos(np.clip(np.sin(lat[sl]) * np.sin(np.radians(la)) + np.cos(lat[sl]) * np.cos(np.radians(la)) * np.cos(lon[sl] - np.radians(lo)), -1, 1))) / r
    near = d < 3.2
    depth = 0.022 * r ** 0.5
    bowl = np.where(d < 1, (d * d - 1) * depth, 0)
    rim = 0.22 * depth * np.exp(-((d - 1) / 0.22) ** 2)
    height[sl] += np.where(near, bowl + rim, 0)
    floor = (d < 0.85)
    if dark:
        albedo[sl] = np.where(floor, albedo[sl] * 0.55, albedo[sl])
    if young:
        albedo[sl] += np.where(near, 0.07 * np.exp(-np.maximum(d - 1, 0) * 2.2), 0)
# the great ray systems: bright streaks running out from young craters
for la, lo, r, young, dark in NAMED:
    if not young:
        continue
    d = dist(la, lo)
    b = bearing(la, lo)
    rays = np.zeros((H, W))
    for k in range(int(48 if r > 1 else 18)):
        a0 = rng.uniform(-np.pi, np.pi)
        wdt = rng.uniform(0.008, 0.045)
        ln = rng.uniform(8, 38 if r > 1.3 else 16)
        da = np.angle(np.exp(1j * (b - a0)))
        rays = np.maximum(rays, np.exp(-(da / wdt) ** 2) * np.exp(-d / ln))
    albedo += rays * np.clip((d - r) / r, 0, 1) * (0.09 if r > 1 else 0.07) * (0.6 + 0.8 * fbm(20, 9))

albedo = np.clip(albedo, 0.08, 0.95)
height = np.clip(0.5 + height * 2.2, 0, 1)
img = np.stack([albedo, height, albedo], -1)
Image.fromarray((img * 255).astype(np.uint8)).save("public/space/moon-map.webp", quality=92, method=6)
Image.fromarray((img * 255).astype(np.uint8)).resize((512, 256), Image.LANCZOS).save("public/space/moon-map-s.webp", quality=92, method=6)
print("albedo", albedo.min(), albedo.max(), "height", height.min(), height.max())
