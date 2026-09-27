import * as THREE from 'three';
import { mulberry32 } from '../shared/rng.js';
import { leafClusterTexture, barkTexture } from './textures.js';
import { THREE_CHUNKS } from './glsl.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;

export function taperedTube(points, radii, radial = 7, vScale = 0.5) {
  const pos = [], nor = [], uv = [], idx = [];
  let len = 0;
  let prevN = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const t = new V3().subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    let n;
    if (!prevN) {
      n = Math.abs(t.y) < 0.9 ? new V3(0, 1, 0).cross(t).normalize() : new V3(1, 0, 0).cross(t).normalize();
    } else {
      n = prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))).normalize();
    }
    prevN = n;
    const b = new V3().crossVectors(t, n).normalize();
    if (i > 0) len += p.distanceTo(points[i - 1]);
    for (let r = 0; r <= radial; r++) {
      const a = (r / radial) * Math.PI * 2;
      const dir = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
      pos.push(p.x + dir.x * radii[i], p.y + dir.y * radii[i], p.z + dir.z * radii[i]);
      nor.push(dir.x, dir.y, dir.z);
      uv.push(r / radial * 2, len * vScale);
    }
  }
  for (let i = 0; i < points.length - 1; i++) {
    for (let r = 0; r < radial; r++) {
      const a = i * (radial + 1) + r, b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function curve(from, to, bend, n = 5) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = new V3().lerpVectors(from, to, t);
    p.addScaledVector(bend, Math.sin(t * Math.PI) * 1.0);
    pts.push(p);
  }
  return pts;
}

// Leaf cards scattered over a sphere, with spherical normals for soft volumetric shading.
function leafCluster(c, R, count, rand, palette, opts = {}) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const tmp = new V3();
  for (let k = 0; k < count; k++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const d = new V3(s * Math.cos(th), u * (opts.flat || 0.85), s * Math.sin(th)).normalize();
    if (opts.droop) d.y -= opts.droop;
    const rr = R * (0.45 + 0.55 * Math.pow(rand(), 0.6));
    const center = c.clone().addScaledVector(d, rr);
    const size = R * (opts.card || 0.95) * (0.75 + rand() * 0.5);
    const n = d.clone().add(new V3(0, 0.35, 0)).normalize();
    const t1 = Math.abs(n.y) < 0.95 ? new V3(0, 1, 0).cross(n).normalize() : new V3(1, 0, 0).cross(n).normalize();
    const t2 = new V3().crossVectors(n, t1);
    const ang = rand() * Math.PI * 2;
    const a1 = t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
    const a2 = new V3().crossVectors(n, a1);
    const base = pos.length / 3;
    const shade = 0.55 + 0.45 * (d.y * 0.5 + 0.5);
    const inner = 0.75 + 0.25 * (rr / R);
    const pc = palette[Math.floor(rand() * palette.length)];
    const jitter = 0.88 + rand() * 0.22;
    for (const [sx, sy, uu, vv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      tmp.copy(center).addScaledVector(a1, sx * size * 0.5).addScaledVector(a2, sy * size * 0.5);
      pos.push(tmp.x, tmp.y, tmp.z);
      const nn = tmp.clone().sub(c).normalize().lerp(new V3(0, 1, 0), 0.15).normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push(uu, vv);
      const f = shade * inner * jitter;
      col.push(pc.r * f, pc.g * f, pc.b * f);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

const hexes = (arr) => arr.map((h) => new THREE.Color(h));
const PALETTES = {
  oak: hexes([0x4c8a2c, 0x5f9d34, 0x3f7a28, 0x6aa83a]),
  autumnA: hexes([0xe0762a, 0xf09a3a, 0xc85a22, 0xf5b04a]),
  autumnB: hexes([0xc23c2a, 0xe0603a, 0xd8a02a, 0xa82e22]),
  pine: hexes([0x2e5e38, 0x3a6e40, 0x274f33, 0x467a46]),
  bush: hexes([0x45802c, 0x588f33, 0x3c7026]),
};

function oakGeometry(seed, palette) {
  const rand = mulberry32(seed);
  const trunkH = 3.4 + rand() * 1.6;
  const lean = new V3((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8);
  const top = new V3(lean.x, trunkH, lean.z);
  const trunkPts = curve(new V3(0, -0.4, 0), top, new V3((rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4), 6);
  const trunkR = trunkPts.map((_, i) => (i === 0 ? 0.62 : i === 1 ? 0.45 : 0.42 - i * 0.03));
  const woods = [taperedTube(trunkPts, trunkR, 9, 0.35)];
  const leaves = [];
  const nb = 3 + Math.floor(rand() * 2);
  const clusters = [];
  for (let b = 0; b < nb; b++) {
    const a = (b / nb) * Math.PI * 2 + rand() * 0.8;
    const startY = trunkH * (0.62 + rand() * 0.3);
    const start = new V3(lean.x * (startY / trunkH), startY, lean.z * (startY / trunkH));
    const L = 2.0 + rand() * 1.3;
    const end = start.clone().add(new V3(Math.cos(a) * L, 0.9 + rand() * 1.2, Math.sin(a) * L));
    const pts = curve(start, end, new V3(0, 0.35, 0), 4);
    woods.push(taperedTube(pts, pts.map((_, i) => 0.2 - i * 0.04), 6, 0.35));
    clusters.push([end.clone().add(new V3(0, 0.3, 0)), 1.6 + rand() * 0.6]);
  }
  clusters.push([top.clone().add(new V3(0, 1.4, 0)), 2.2 + rand() * 0.4]);
  for (let i = 0; i < 2; i++) {
    const a = rand() * Math.PI * 2;
    clusters.push([top.clone().add(new V3(Math.cos(a) * 1.4, 0.5 + rand() * 0.6, Math.sin(a) * 1.4)), 1.5 + rand() * 0.4]);
  }
  for (const [c, R] of clusters) leaves.push(leafCluster(c, R, Math.round(24 * R), rand, palette));
  return { wood: mergeGeometries(woods), leaves: mergeGeometries(leaves), height: trunkH + 3.5 };
}

function pineGeometry(seed) {
  const rand = mulberry32(seed);
  const H = 8 + rand() * 3.5;
  const trunkPts = [new V3(0, -0.4, 0), new V3(0, H * 0.3, 0), new V3(0, H * 0.7, 0), new V3(0, H, 0)];
  const wood = taperedTube(trunkPts, [0.42, 0.3, 0.18, 0.05], 8, 0.35);
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const tiers = 7;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = 1.8 + f * (H - 1.6);
    const R = 2.9 * (1 - f) + 0.45;
    const cards = Math.round(10 + R * 4);
    for (let k = 0; k < cards; k++) {
      const a = (k / cards) * Math.PI * 2 + rand() * 0.4;
      const out = new V3(Math.cos(a), -0.35 - rand() * 0.2, Math.sin(a)).normalize();
      const side = new V3(-Math.sin(a), 0, Math.cos(a));
      const root = new V3(0, y + 0.25, 0);
      const tip = root.clone().addScaledVector(out, R * (0.9 + rand() * 0.3));
      const w = 0.7 + R * 0.25;
      const base = pos.length / 3;
      const pc = PALETTES.pine[Math.floor(rand() * PALETTES.pine.length)];
      const quad = [
        root.clone().addScaledVector(side, -w * 0.3), root.clone().addScaledVector(side, w * 0.3),
        tip.clone().addScaledVector(side, w * 0.5), tip.clone().addScaledVector(side, -w * 0.5),
      ];
      const uvs = [[0.3, 0.1], [0.7, 0.1], [1, 0.95], [0, 0.95]];
      quad.forEach((p, qi) => {
        pos.push(p.x, p.y, p.z);
        const nn = p.clone().sub(new V3(0, y + 0.9, 0)).normalize().lerp(new V3(0, 1, 0), 0.25).normalize();
        nor.push(nn.x, nn.y, nn.z);
        uv.push(uvs[qi][0], uvs[qi][1]);
        const sh = (0.6 + 0.4 * f) * (qi < 2 ? 0.7 : 1.0) * (0.9 + rand() * 0.2);
        col.push(pc.r * sh, pc.g * sh, pc.b * sh);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  lg.setIndex(idx);
  const top = leafCluster(new V3(0, H + 0.2, 0), 0.8, 10, rand, PALETTES.pine, { flat: 1.3 });
  return { wood, leaves: mergeGeometries([lg, top]), height: H };
}

function deadTreeGeometry(seed) {
  const rand = mulberry32(seed);
  const H = 4 + rand() * 2;
  const woods = [];
  const trunk = curve(new V3(0, -0.4, 0), new V3((rand() - 0.5) * 1.5, H, (rand() - 0.5) * 1.5), new V3(0.5, 0, 0.3), 6);
  woods.push(taperedTube(trunk, trunk.map((_, i) => 0.45 - i * 0.07), 7, 0.35));
  for (let b = 0; b < 5; b++) {
    const i = 2 + Math.floor(rand() * 3);
    const s = trunk[i];
    const a = rand() * Math.PI * 2;
    const e = s.clone().add(new V3(Math.cos(a) * 2, 0.8 + rand() * 1.5, Math.sin(a) * 2));
    const pts = curve(s, e, new V3(0, 0.4, 0), 4);
    woods.push(taperedTube(pts, pts.map((_, k) => 0.14 - k * 0.035), 5, 0.35));
  }
  return { wood: mergeGeometries(woods), leaves: null, height: H };
}

function crystalGeometry(seed) {
  const rand = mulberry32(seed);
  const rocks = new THREE.DodecahedronGeometry(1.4, 1);
  rocks.scale(1.3, 0.55, 1.2);
  const shards = [];
  const n = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const h = 2.5 + rand() * 5;
    const g = new THREE.ConeGeometry(0.28 + rand() * 0.4, h, 6, 1);
    g.translate(0, h / 2, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((rand() - 0.5) * 0.9, rand() * 6.28, (rand() - 0.5) * 0.9));
    m.setPosition((rand() - 0.5) * 1.6, 0.1, (rand() - 0.5) * 1.6);
    g.applyMatrix4(m);
    const c = new THREE.Color().setHSL(0.5 + rand() * 0.25, 0.8, 0.6);
    const cols = [];
    for (let k = 0; k < g.attributes.position.count; k++) {
      const y = g.attributes.position.getY(k);
      const f = 0.4 + 0.6 * THREE.MathUtils.clamp(y / 7, 0, 1);
      cols.push(c.r * f, c.g * f, c.b * f);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    shards.push(g.index ? g.toNonIndexed() : g);
  }
  const rk = rocks;
  rk.deleteAttribute('uv');
  const rc = [];
  for (let k = 0; k < rk.attributes.position.count; k++) { const f = 0.35 + rand() * 0.1; rc.push(f, f * 0.95, f * 1.05); }
  rk.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  const merged = mergeGeometries(shards.map((g) => { g.deleteAttribute('uv'); return g; }));
  return { wood: rk, leaves: merged, height: 6 };
}

export function rockGeometry(seed) {
  const rand = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const sx = 1 + rand() * 0.6, sy = 0.55 + rand() * 0.4, sz = 0.9 + rand() * 0.5;
  const f1 = 1.3 + rand(), f2 = 3 + rand() * 2;
  const o = rand() * 10;
  for (let i = 0; i < p.count; i++) {
    const v = new V3(p.getX(i), p.getY(i), p.getZ(i));
    const n = Math.sin(v.x * f1 + o) * Math.cos(v.z * f1 - o) * 0.18 + Math.sin(v.y * f2 + v.x * 2 + o) * 0.07;
    v.multiplyScalar(1 + n);
    if (v.y < -0.25) v.y = -0.25 - (v.y + 0.25) * 0.2;
    const facet = Math.round(v.x * 3) / 3;
    v.x = v.x * 0.85 + facet * 0.15;
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  g.computeVertexNormals();
  const cols = [];
  const moss = new THREE.Color(0x5b7a2e), stone = new THREE.Color(0x8e877c), dark = new THREE.Color(0x5f5a53);
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const ny = nrm.getY(i);
    const c = stone.clone().lerp(dark, THREE.MathUtils.clamp(0.5 - p.getY(i), 0, 1) * 0.6 + rand() * 0.15);
    c.lerp(moss, THREE.MathUtils.smoothstep(ny, 0.55, 0.85) * 0.85);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  return g;
}

function bushGeometry(seed) {
  const rand = mulberry32(seed);
  const parts = [];
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const c = new V3((rand() - 0.5) * 1.2, 0.5 + rand() * 0.3, (rand() - 0.5) * 1.2);
    parts.push(leafCluster(c, 0.9 + rand() * 0.35, 18, rand, PALETTES.bush, { flat: 0.7 }));
  }
  return mergeGeometries(parts);
}

// --------------------------------------------------------------------------------------------
class Chunked {
  constructor(scene, geometry, material, items, { size = 160, cast = true, receive = true } = {}) {
    this.meshes = [];
    const groups = new Map();
    for (const it of items) {
      const key = `${Math.floor(it.x / size)},${Math.floor(it.z / size)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    for (const list of groups.values()) {
      const m = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((it, i) => m.setMatrixAt(i, it.matrix));
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = cast; m.receiveShadow = receive;
      m.computeBoundingSphere();
      m.userData.center = m.boundingSphere.center.clone();
      m.userData.radius = m.boundingSphere.radius;
      scene.add(m);
      this.meshes.push(m);
    }
  }
  update(cam, maxDist) {
    for (const m of this.meshes) m.visible = m.userData.center.distanceTo(cam) - m.userData.radius < maxDist;
  }
}

export class Foliage {
  constructor(gfx, terrain) {
    this.gfx = gfx;
    this.time = { value: 0 };
    const scene = gfx.scene;
    const scatter = terrain.scatter();
    this.scatter = scatter;
    const leafTex = leafClusterTexture();
    const bark = barkTexture();
    const timeU = this.time;
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8, metalness: 0 });
    leafMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeU;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `
vec3 transformed = vec3(position);
#ifdef USE_INSTANCING
vec3 iw = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
vec3 iw = vec3(0.0);
#endif
float sway = sin(uTime * 1.2 + iw.x * 0.07 + iw.z * 0.05) * 0.6 + sin(uTime * 2.6 + iw.z * 0.3) * 0.25;
float hgt = max(position.y - 1.0, 0.0);
transformed.x += sway * 0.045 * hgt;
transformed.z += sway * 0.03 * hgt;
transformed += normal * sin(uTime * 5.0 + dot(position, vec3(3.1, 1.7, 2.3)) + iw.x) * 0.035;
`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
        .replace('#include <lights_fragment_begin>', THREE_CHUNKS.lights_fragment_begin_patched('0.55', '2.5'));
    };
    leafMat.customProgramCacheKey = () => 'leaves-v1';
    const barkMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, color: 0x9a7a60, roughness: 0.95 });
    const deadMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, color: 0x4d4642, roughness: 1 });
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
    const crystalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.2, emissive: 0x3fd8ff, emissiveIntensity: 0.9, flatShading: true });
    crystalMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= vColor.rgb * 1.6;');
    };
    this.crystalMat = crystalMat;
    this.materials = { leafMat, barkMat, rockMat, crystalMat, deadMat };

    const variants = {
      oak: [oakGeometry(11, PALETTES.oak), oakGeometry(23, PALETTES.oak), oakGeometry(37, PALETTES.oak)],
      autumn: [oakGeometry(41, PALETTES.autumnA), oakGeometry(53, PALETTES.autumnB)],
      pine: [pineGeometry(5), pineGeometry(17)],
      dead: [deadTreeGeometry(3)],
      crystal: [crystalGeometry(7), crystalGeometry(8)],
    };
    const byVariant = new Map();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), pz = new V3();
    this.colliders = [];
    for (const t of scatter.trees) {
      const list = variants[t.type];
      const vi = Math.floor(t.v * list.length) % list.length;
      const key = `${t.type}:${vi}`;
      if (!byVariant.has(key)) byVariant.set(key, []);
      q.setFromAxisAngle(new V3(0, 1, 0), t.rot);
      const sc = t.type === 'pine' ? t.s * 1.05 : t.s;
      s.set(sc, sc * (0.9 + t.v * 0.25), sc);
      pz.set(t.x, t.y, t.z);
      m4.compose(pz, q, s);
      byVariant.get(key).push({ x: t.x, z: t.z, matrix: m4.clone() });
      this.colliders.push({ x: t.x, z: t.z, r: (t.type === 'crystal' ? 1.4 : 0.55) * sc });
    }
    this.sets = [];
    for (const [key, items] of byVariant) {
      const [type, vi] = key.split(':');
      const g = variants[type][+vi];
      if (type === 'crystal') {
        this.sets.push(new Chunked(scene, g.wood, rockMat, items));
        this.sets.push(new Chunked(scene, g.leaves, crystalMat, items, { cast: true }));
      } else {
        this.sets.push(new Chunked(scene, g.wood, type === 'dead' ? deadMat : barkMat, items));
        if (g.leaves) this.sets.push(new Chunked(scene, g.leaves, leafMat, items));
      }
    }
    // rocks
    const rockGeos = [rockGeometry(1), rockGeometry(2), rockGeometry(3), rockGeometry(4)];
    const rockItems = rockGeos.map(() => []);
    for (const r of scatter.rocks) {
      const vi = Math.floor(r.v * 4) % 4;
      q.setFromAxisAngle(new V3(0, 1, 0), r.rot);
      s.set(r.s, r.s, r.s);
      pz.set(r.x, r.y - 0.15 * r.s, r.z);
      m4.compose(pz, q, s);
      rockItems[vi].push({ x: r.x, z: r.z, matrix: m4.clone() });
      if (r.s > 0.9) this.colliders.push({ x: r.x, z: r.z, r: r.s * 1.0 });
    }
    rockGeos.forEach((g, i) => { if (rockItems[i].length) this.sets.push(new Chunked(scene, g, rockMat, rockItems[i])); });
    // bushes
    const bushGeo = bushGeometry(9);
    const bushItems = scatter.bushes.map((b) => {
      q.setFromAxisAngle(new V3(0, 1, 0), b.rot);
      s.set(b.s, b.s, b.s); pz.set(b.x, b.y, b.z);
      m4.compose(pz, q, s);
      return { x: b.x, z: b.z, matrix: m4.clone() };
    });
    if (bushItems.length) this.sets.push(new Chunked(scene, bushGeo, leafMat, bushItems, { cast: true }));
    this.rockGeos = rockGeos;
    this.variants = variants;
  }

  update(time, cam, maxDist) {
    this.time.value = time;
    for (const s of this.sets) s.update(cam, maxDist);
  }
}
