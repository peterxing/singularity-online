import { Noise } from './noise.js';
import { mulberry32, clamp, lerp, smoothstep, distToPolyline, hash2 } from './rng.js';

export const WORLD = { size: 1024, half: 512, res: 513, water: 0, seed: 20260927 };

// Named places. h is resolved at generation time.
export const SITES = {
  eacc:  { x: 310, z: 30, r: 60, blend: 46, lift: 2.5, plaza: 46, name: 'Gigaforge Citadel', faction: 'eacc' },
  ea:    { x: -310, z: 30, r: 60, blend: 46, lift: 2.5, plaza: 46, name: 'Lumen Sanctum', faction: 'ea' },
  spire: { x: 0, z: -175, r: 44, blend: 70, lift: 16, plaza: 38, name: 'The Singularity Spire' },
  cross: { x: 0, z: 55, r: 18, blend: 26, lift: 0.5, plaza: 13, name: 'Pareto Crossing' },
  campE: { x: 178, z: 168, r: 16, blend: 22, lift: 0.3, plaza: 11, name: 'Launchpad Outpost', faction: 'eacc' },
  campW: { x: -178, z: 168, r: 16, blend: 22, lift: 0.3, plaza: 11, name: 'Longview Camp', faction: 'ea' },
  mill:  { x: 72, z: 214, r: 13, blend: 18, lift: 0.4, plaza: 0, name: 'Compute Mill' },
  ruins: { x: 0, z: -42, r: 26, blend: 26, lift: 0.8, plaza: 0, name: 'Ruins of Hype' },
};

export const ROADS = [
  [[-255, 32], [-200, 44], [-120, 60], [-50, 58], [0, 55], [50, 58], [120, 60], [200, 44], [255, 32]],
  [[0, 55], [6, 12], [0, -30], [-4, -80], [0, -132]],
  [[0, 55], [18, 110], [45, 170], [66, 204]],
  [[-292, 86], [-250, 128], [-178, 168], [-128, 214], [-112, 238]],
  [[292, 86], [250, 128], [178, 168], [120, 200], [82, 212]],
  [[120, 60], [150, -10], [170, -80]],
  [[-120, 60], [-150, -10], [-170, -80], [-192, -170], [-176, -262]],
];

export const RIVER = [[-122, 326], [-168, 368], [-214, 404], [-250, 448], [-282, 520]];
export const LAKE = { x: -92, z: 298, r: 60 };

export const FIELDS = [
  { x: 30, z: 236, w: 46, h: 34, rot: 0.08 },
  { x: 116, z: 238, w: 44, h: 38, rot: -0.06 },
  { x: 74, z: 270, w: 64, h: 26, rot: 0.02 },
  { x: 118, z: 184, w: 34, h: 30, rot: 0.12 },
];

export const ZONES = [
  { name: 'Gigaforge Citadel', sub: 'Capital of the Accelerationists', x: 310, z: 30, r: 95 },
  { name: 'Lumen Sanctum', sub: 'Capital of the Aligned', x: -310, z: 30, r: 95 },
  { name: 'The Singularity Spire', sub: 'Lair of Moloch', x: 0, z: -175, r: 95 },
  { name: 'Ruins of Hype', sub: 'Contested Territory', x: 0, z: -42, r: 62 },
  { name: 'Pareto Crossing', sub: 'Neutral Ground', x: 0, z: 55, r: 45 },
  { name: 'Compute Fields', sub: 'Contested Territory', x: 78, z: 225, r: 95 },
  { name: 'Lake Latent', sub: 'Contested Territory', x: -92, z: 298, r: 100 },
  { name: 'Red-Tape Quarry', sub: 'Contested Territory', x: 172, z: -92, r: 75 },
  { name: 'The Racing Wastes', sub: 'Contested Territory', x: -172, z: -92, r: 75 },
  { name: "Basilisk's Hollow", sub: 'Here Be Hypotheticals', x: -176, z: -285, r: 80 },
  { name: 'Accelerant Meadows', sub: 'e/acc Territory', x: 200, z: 110, r: 90 },
  { name: 'Utilon Meadows', sub: 'EA Territory', x: -200, z: 110, r: 90 },
  { name: 'Frontier Peaks', sub: 'Contested Territory', x: 0, z: -400, r: 190 },
];

export function zoneAt(x, z) {
  let best = null, bd = Infinity;
  for (const zn of ZONES) {
    const d = Math.hypot(x - zn.x, z - zn.z) / zn.r;
    if (d < 1 && d < bd) { bd = d; best = zn; }
  }
  return best || { name: 'The Latent Wilds', sub: 'Contested Territory' };
}

export class Terrain {
  constructor(seed = WORLD.seed) {
    this.seed = seed;
    this.noise = new Noise(seed);
    this.size = WORLD.size;
    this.half = WORLD.half;
    this.res = WORLD.res;
    this.cell = this.size / (this.res - 1);
    this.heights = new Float32Array(this.res * this.res);
    this.splat = new Uint8Array(this.res * this.res * 4);  // r road, g field, b plaza, a forest
    this.grass = new Uint8Array(this.res * this.res * 4);  // r grass, g wheat, b flowers, a rock/cliff
    this._generate();
  }

  baseHeight(x, z) {
    const n = this.noise;
    let h = 7 + n.fbm(x * 0.003, z * 0.003, 5) * 11 + n.fbm(x * 0.011 + 40, z * 0.011 - 20, 3) * 2.2;
    const hill = Math.max(0, n.fbm(x * 0.0052 + 91, z * 0.0052 - 33, 4));
    h += hill * hill * 60;
    const north = smoothstep(-215, -430, z + n.fbm(x * 0.004, 3.3, 2) * 60);
    if (north > 0) h += north * (26 + n.ridged(x * 0.0042 + 5, z * 0.0042 - 9, 5) * 165);
    const ex = x / 468, ez = z > 0 ? z / 440 : z / 530;
    const d = Math.sqrt(ex * ex + ez * ez) + n.fbm(x * 0.005 + 200, z * 0.005 + 200, 3) * 0.07;
    const coast = smoothstep(0.84, 1.0, d);
    h = lerp(h, -15 - n.fbm(x * 0.01, z * 0.01, 2) * 3, coast);
    return h;
  }

  _generate() {
    const { res, half, cell, noise: n } = this;
    for (const k in SITES) {
      const s = SITES[k];
      s.h = Math.max(5.5, this.baseHeight(s.x, s.z) + s.lift);
    }
    const H = this.heights;
    for (let j = 0; j < res; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < res; i++) {
        const x = -half + i * cell;
        let h = this.baseHeight(x, z);
        // lake basin
        const dl = Math.hypot(x - LAKE.x, z - LAKE.z) + n.simplex(x * 0.02, z * 0.02) * 9;
        const lt = smoothstep(LAKE.r + 34, LAKE.r - 12, dl);
        if (lt > 0) h = Math.min(h, lerp(h, -7.5, lt));
        // river
        const dr = distToPolyline(x, z, RIVER) + n.simplex(x * 0.03, z * 0.03) * 3;
        const rt = smoothstep(26, 6, dr);
        if (rt > 0) h = Math.min(h, lerp(h, -3.8, rt));
        // flatten sites
        for (const k in SITES) {
          const s = SITES[k];
          const d = Math.hypot(x - s.x, z - s.z);
          if (d < s.r + s.blend) {
            const t = smoothstep(s.r + s.blend, s.r, d);
            h = lerp(h, s.h, t);
          }
        }
        // soften roads
        H[j * res + i] = h;
      }
    }
    // Road smoothing pass: pull terrain toward a blurred version along roads
    const blurred = this._blur(H, 4);
    const roadD = new Float32Array(res * res);
    for (let j = 0; j < res; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < res; i++) {
        const x = -half + i * cell;
        let d = Infinity;
        for (const r of ROADS) {
          const dd = distToPolyline(x, z, r);
          if (dd < d) d = dd;
        }
        roadD[j * res + i] = d;
        const t = smoothstep(9, 2, d);
        if (t > 0) H[j * res + i] = lerp(H[j * res + i], blurred[j * res + i], t * 0.85);
      }
    }
    this.roadDist = roadD;

    // Masks
    const S = this.splat, G = this.grass;
    for (let j = 0; j < res; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < res; i++) {
        const x = -half + i * cell;
        const k = j * res + i;
        const h = H[k];
        const hl = H[j * res + Math.max(0, i - 1)], hr = H[j * res + Math.min(res - 1, i + 1)];
        const hd = H[Math.max(0, j - 1) * res + i], hu = H[Math.min(res - 1, j + 1) * res + i];
        const nx = (hl - hr) / (2 * cell), nz = (hd - hu) / (2 * cell);
        const ny = 1 / Math.sqrt(nx * nx + nz * nz + 1);
        const slope = 1 - ny;
        const wob = n.simplex(x * 0.09, z * 0.09);
        const road = 1 - smoothstep(1.9, 3.6, roadD[k] + wob * 0.9);
        let plaza = 0;
        for (const key in SITES) {
          const s = SITES[key];
          if (!s.plaza) continue;
          const d = Math.hypot(x - s.x, z - s.z) + wob * 1.5;
          plaza = Math.max(plaza, 1 - smoothstep(s.plaza - 2, s.plaza + 1.5, d));
        }
        let field = 0;
        for (const f of FIELDS) {
          const c = Math.cos(f.rot), sn = Math.sin(f.rot);
          const lx = (x - f.x) * c + (z - f.z) * sn, lz = -(x - f.x) * sn + (z - f.z) * c;
          const fx = 1 - smoothstep(f.w / 2 - 1.5, f.w / 2, Math.abs(lx));
          const fz = 1 - smoothstep(f.h / 2 - 1.5, f.h / 2, Math.abs(lz));
          field = Math.max(field, fx * fz);
        }
        field *= 1 - road;
        let nearSite = 0;
        for (const key in SITES) {
          const s = SITES[key];
          nearSite = Math.max(nearSite, 1 - smoothstep(s.r * 0.9, s.r + 20, Math.hypot(x - s.x, z - s.z)));
        }
        const fn = n.fbm(x * 0.0075 + 300, z * 0.0075 - 300, 3);
        let forest = smoothstep(0.05, 0.3, fn) * (1 - nearSite) * (1 - road) * (1 - field) * smoothstep(1.5, 4, h);
        const rock = clamp(smoothstep(0.34, 0.52, slope + wob * 0.04) + smoothstep(92, 110, h + wob * 8), 0, 1);
        const land = smoothstep(1.2, 2.2, h);
        const plazaHard = smoothstep(0.35, 0.6, plaza);
        let grass = land * (1 - rock) * (1 - road) * (1 - plazaHard) * (1 - smoothstep(70, 88, h));
        grass *= forest > 0.2 ? lerp(1, 0.62, forest) : 1;
        const flowers = smoothstep(0.35, 0.65, n.fbm(x * 0.02 - 70, z * 0.02 + 70, 2)) * grass * (1 - forest) * (1 - field);
        S[k * 4] = road * 255; S[k * 4 + 1] = field * 255; S[k * 4 + 2] = plaza * 255; S[k * 4 + 3] = forest * 255;
        G[k * 4] = grass * 255; G[k * 4 + 1] = field * grass * 255; G[k * 4 + 2] = flowers * 255; G[k * 4 + 3] = rock * 255;
      }
    }
  }

  _blur(src, radius) {
    const res = this.res;
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        let s = 0, c = 0;
        for (let o = -radius; o <= radius; o++) {
          const ii = i + o;
          if (ii < 0 || ii >= res) continue;
          s += src[j * res + ii]; c++;
        }
        tmp[j * res + i] = s / c;
      }
    }
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        let s = 0, c = 0;
        for (let o = -radius; o <= radius; o++) {
          const jj = j + o;
          if (jj < 0 || jj >= res) continue;
          s += tmp[jj * res + i]; c++;
        }
        out[j * res + i] = s / c;
      }
    }
    return out;
  }

  _sample(arr, x, z, stride = 1, ch = 0) {
    const { res, half, cell } = this;
    const fx = clamp((x + half) / cell, 0, res - 1.001), fz = clamp((z + half) / cell, 0, res - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = arr[(j * res + i) * stride + ch], b = arr[(j * res + i + 1) * stride + ch];
    const c = arr[((j + 1) * res + i) * stride + ch], d = arr[((j + 1) * res + i + 1) * stride + ch];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  heightAt(x, z) { return this._sample(this.heights, x, z); }
  groundAt(x, z) { return Math.max(this.heightAt(x, z), WORLD.water - 1.25); }
  splatAt(x, z, ch) { return this._sample(this.splat, x, z, 4, ch) / 255; }
  grassAt(x, z, ch) { return this._sample(this.grass, x, z, 4, ch) / 255; }

  normalAt(x, z) {
    const e = 1.0;
    const nx = this.heightAt(x - e, z) - this.heightAt(x + e, z);
    const nz = this.heightAt(x, z - e) - this.heightAt(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    return [nx / l, (2 * e) / l, nz / l];
  }

  slopeAt(x, z) { return 1 - this.normalAt(x, z)[1]; }

  isGoodGround(x, z, maxSlope = 0.42) {
    const h = this.heightAt(x, z);
    if (h < 1.6) return false;
    if (Math.abs(x) > 490 || Math.abs(z) > 490) return false;
    return this.slopeAt(x, z) < maxSlope;
  }

  randomPointIn(cx, cz, r, rand, opts = {}) {
    for (let t = 0; t < 60; t++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!this.isGoodGround(x, z, opts.maxSlope || 0.42)) continue;
      if (opts.avoidRoads && this.splatAt(x, z, 0) > 0.2) continue;
      return [x, z];
    }
    return [cx, cz];
  }

  // Deterministic decoration placement used by the client renderer.
  scatter() {
    const rand = mulberry32(this.seed ^ 0x9e3779b9);
    const n = this.noise;
    const trees = [], rocks = [], bushes = [];
    const step = 6.5;
    for (let z = -500; z < 500; z += step) {
      for (let x = -500; x < 500; x += step) {
        const px = x + (rand() - 0.5) * step * 0.9, pz = z + (rand() - 0.5) * step * 0.9;
        const h = this.heightAt(px, pz);
        if (h < 1.8) { rand(); rand(); continue; }
        const slope = this.slopeAt(px, pz);
        const forest = this.splatAt(px, pz, 3);
        const road = this.splatAt(px, pz, 0), plaza = this.splatAt(px, pz, 2), field = this.splatAt(px, pz, 1);
        const blocked = road > 0.05 || plaza > 0.05 || field > 0.05;
        let nearSite = Infinity, siteKey = null;
        for (const k in SITES) {
          const s = SITES[k];
          const d = Math.hypot(px - s.x, pz - s.z) - s.r;
          if (d < nearSite) { nearSite = d; siteKey = k; }
        }
        const r = rand(), r2 = rand();
        const spireD = Math.hypot(px - SITES.spire.x, pz - SITES.spire.z);
        if (!blocked && slope < 0.5 && nearSite > 6) {
          const meadow = 0.012 + smoothstep(0.2, 0.7, n.fbm(px * 0.01 + 11, pz * 0.01 - 5, 2)) * 0.05;
          const p = forest * 0.62 + meadow;
          if (r < p) {
            let type = 'oak';
            if (h > 34 || pz < -260) type = 'pine';
            else if (n.simplex(px * 0.012 + 3, pz * 0.012 + 8) > 0.45) type = 'autumn';
            else if (n.simplex(px * 0.02 - 30, pz * 0.02) > 0.55) type = 'pine';
            if (spireD < 120) type = spireD < 95 ? 'crystal' : 'dead';
            if (h > 85) continue;
            trees.push({ x: px, y: h, z: pz, type, s: 0.75 + r2 * 0.6, rot: rand() * Math.PI * 2, v: rand() });
            continue;
          }
        }
        if (!blocked && nearSite > 2) {
          const rockP = 0.006 + smoothstep(0.25, 0.6, slope) * 0.25 + (h > 50 ? 0.03 : 0);
          if (r2 < rockP) {
            rocks.push({ x: px, y: h, z: pz, s: 0.6 + rand() * (slope > 0.3 ? 3.2 : 1.6), rot: rand() * 6.28, v: rand() });
            continue;
          }
          if (forest > 0.3 && r2 > 0.8 && slope < 0.4) bushes.push({ x: px, y: h, z: pz, s: 0.7 + rand() * 0.7, rot: rand() * 6.28, v: rand() });
        }
      }
    }
    return { trees, rocks, bushes };
  }
}

export function inSafeZone(x, z) {
  for (const k of ['eacc', 'ea']) {
    const s = SITES[k];
    if (Math.hypot(x - s.x, z - s.z) < 78) return s.faction;
  }
  return null;
}

export { hash2 };
