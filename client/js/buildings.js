import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITES, FIELDS, LAKE } from '../shared/terrain.js';
import { mulberry32 } from '../shared/rng.js';
import { stoneBlockTexture, roofTileTexture, plankTexture, plasterTexture, metalPanelTexture, marbleTexture, bannerTexture, signTexture, textSpriteTexture, rackTexture } from './textures.js';
import { NOISE_GLSL } from './glsl.js';

const V3 = THREE.Vector3;
const Q = new THREE.Quaternion();
const E = new THREE.Euler();

function mat4(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  E.set(rx, ry, rz, 'YXZ');
  Q.setFromEuler(E);
  return new THREE.Matrix4().compose(new V3(x, y, z), Q, new V3(sx, sy, sz));
}

// Box with UVs in metres so textures tile uniformly.
function boxM(w, h, d, s = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] * s, uv.getY(i) * dims[f][1] * s);
  }
  return g;
}
function cylM(rt, rb, h, seg = 16, s = 0.5, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ * s, uv.getY(i) * h * s);
  return g;
}
function coneM(r, h, seg = 16, s = 0.5) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, true);
  const uv = g.attributes.uv;
  const slant = Math.hypot(r, h);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r * s, uv.getY(i) * slant * s);
  return g;
}
// Gabled roof prism: ridge along X.
function roofM(w, d, h, over = 0.6, s = 0.5) {
  const W = w / 2 + over, D = d / 2 + over;
  const p = [], uv = [];
  const slant = Math.hypot(D, h);
  const quad = (a, b, c, e, ua) => { p.push(...a, ...b, ...c, ...a, ...c, ...e); uv.push(...ua[0], ...ua[1], ...ua[2], ...ua[0], ...ua[2], ...ua[3]); };
  quad([-W, 0, D], [W, 0, D], [W, h, 0], [-W, h, 0], [[0, 0], [2 * W * s, 0], [2 * W * s, slant * s], [0, slant * s]]);
  quad([W, 0, -D], [-W, 0, -D], [-W, h, 0], [W, h, 0], [[0, 0], [2 * W * s, 0], [2 * W * s, slant * s], [0, slant * s]]);
  // gables
  p.push(-w / 2, 0, d / 2, -w / 2, h * (d / 2) / D, 0, -w / 2, 0, -d / 2);
  uv.push(0, 0, d * s * 0.5, h * s, d * s, 0);
  p.push(w / 2, 0, -d / 2, w / 2, h * (d / 2) / D, 0, w / 2, 0, d / 2);
  uv.push(0, 0, d * s * 0.5, h * s, d * s, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

class Kit {
  constructor() { this.b = new Map(); }
  add(key, geo, m) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m);
    if (!this.b.has(key)) this.b.set(key, []);
    this.b.get(key).push(g);
  }
  build(scene, materials) {
    const meshes = [];
    for (const [key, geos] of this.b) {
      const CH = 60;
      for (let i = 0; i < geos.length; i += CH) {
        const merged = mergeGeometries(geos.slice(i, i + CH));
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, materials[key]);
        mesh.castShadow = !key.startsWith('glow');
        mesh.receiveShadow = true;
        scene.add(mesh);
        meshes.push(mesh);
      }
    }
    return meshes;
  }
}

export class Buildings {
  constructor(gfx, terrain, vfx) {
    this.gfx = gfx;
    this.terrain = terrain;
    this.vfx = vfx;
    this.colliders = [];
    this.lights = [];
    this.animated = [];
    this.time = { value: 0 };
    this.banners = { eacc: [], ea: [] };
    this._materials();
    const kit = new Kit();
    this.kit = kit;
    this.rand = mulberry32(2026);
    this._eaccCapital();
    this._eaCapital();
    this._spire();
    this._crossing();
    this._camp(SITES.campE, 'eacc');
    this._camp(SITES.campW, 'ea');
    this._mill();
    this._fences();
    this._ruins();
    this._quarry();
    this._raceWastes();
    this._hollow();
    this._dock();
    this.meshes = kit.build(gfx.scene, this.mats);
    this._buildBanners();
  }

  _materials() {
    const st1 = stoneBlockTexture(3, { base: [196, 180, 160] });
    const st2 = stoneBlockTexture(4, { base: [238, 234, 226] });
    const rf = roofTileTexture(5);
    const wd = plankTexture(9);
    const mt = metalPanelTexture(17);
    const pl = plasterTexture(13);
    const mb = marbleTexture(21);
    const S = (o) => new THREE.MeshStandardMaterial(o);
    this.mats = {
      stoneE: S({ map: st1.map, normalMap: st1.normalMap, roughness: 0.92 }),
      stoneA: S({ map: st2.map, normalMap: st2.normalMap, roughness: 0.85 }),
      stoneD: S({ map: st1.map, normalMap: st1.normalMap, color: 0x6a655f, roughness: 0.95 }),
      roofE: S({ map: rf.map, normalMap: rf.normalMap, color: 0xc0582e, roughness: 0.75 }),
      roofA: S({ map: rf.map, normalMap: rf.normalMap, color: 0x3d64a0, roughness: 0.6 }),
      roofN: S({ map: rf.map, normalMap: rf.normalMap, color: 0x7a5a44, roughness: 0.8 }),
      wood: S({ map: wd.map, normalMap: wd.normalMap, roughness: 0.85 }),
      woodDark: S({ map: wd.map, normalMap: wd.normalMap, color: 0x5a4030, roughness: 0.9 }),
      plaster: S({ map: pl, roughness: 0.9 }),
      metal: S({ map: mt.map, normalMap: mt.normalMap, color: 0xcfd6de, metalness: 0.85, roughness: 0.35 }),
      metalDark: S({ map: mt.map, normalMap: mt.normalMap, color: 0x3a3e46, metalness: 0.8, roughness: 0.45 }),
      marble: S({ map: mb, roughness: 0.35 }),
      gold: S({ color: 0xe2b44c, metalness: 1, roughness: 0.28 }),
      clothE: S({ color: 0xc8541e, roughness: 0.9, side: THREE.DoubleSide }),
      clothA: S({ color: 0x2c6cc0, roughness: 0.9, side: THREE.DoubleSide }),
      paper: S({ color: 0xeae2cc, roughness: 0.95 }),
      redtape: S({ color: 0xc8201a, roughness: 0.6 }),
      rubber: S({ color: 0x151515, roughness: 0.8 }),
      glowE: S({ color: 0x331405, emissive: 0xff8a3a, emissiveIntensity: 1.2, roughness: 0.6 }),
      glowA: S({ color: 0x0a1a33, emissive: 0x9fd4ff, emissiveIntensity: 1.2, roughness: 0.6 }),
      glowC: S({ color: 0x06141a, emissive: 0x3ae0ff, emissiveIntensity: 2.2, roughness: 0.4 }),
      glowP: S({ color: 0x14061a, emissive: 0xb46bff, emissiveIntensity: 2.0, roughness: 0.4 }),
      glowG: S({ color: 0x061a0a, emissive: 0x3aff7a, emissiveIntensity: 1.6, roughness: 0.4 }),
      rack: S({ map: rackTexture(), emissiveMap: null, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.4, metalness: 0.4 }),
      water: S({ color: 0x2a7ab0, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.85 }),
      checker: S({ map: this._checker(), roughness: 0.8, side: THREE.DoubleSide }),
    };
    this.mats.rack.emissiveMap = this.mats.rack.map;
    this.mats.rack.emissiveIntensity = 1.2;
    // spire: dark stone with animated emissive circuitry
    const sp = S({ map: st1.map, normalMap: st1.normalMap, color: 0x2a2d36, roughness: 0.55, metalness: 0.3 });
    const tu = this.time;
    sp.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = tu;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWP; uniform float uTime;\n${NOISE_GLSL}`)
        .replace('#include <emissivemap_fragment>', `
          vec2 cp = vec2(atan(vWP.z + 175.0, vWP.x) * 6.0, vWP.y * 0.6);
          vec2 cell = floor(cp * 2.0);
          float r = hash12(cell);
          vec2 f = fract(cp * 2.0);
          float lineH = step(0.9, f.y) * step(0.5, r);
          float lineV = step(0.9, f.x) * step(r, 0.5);
          float node = step(length(f - 0.5), 0.12) * step(0.85, r);
          float pulse = pow(fract(vWP.y * 0.02 - uTime * 0.35 + r * 0.3), 6.0);
          float circuit = max(max(lineH, lineV), node);
          totalEmissiveRadiance += vec3(0.25, 0.85, 1.0) * circuit * (0.6 + pulse * 5.0);
        `);
    };
    this.mats.spire = sp;
  }

  _checker() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; x.fillRect(i * 16, j * 16, 16, 16); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  ground(x, z) { return this.terrain.heightAt(x, z); }
  collide(x, z, r) { this.colliders.push({ x, z, r }); }
  light(x, y, z, color, intensity = 20, dist = 22, flicker = 0) { this.lights.push({ pos: new V3(x, y, z), color: new THREE.Color(color), intensity, dist, flicker }); }

  // ------------------------------------------------------------------ building blocks
  house(x, z, rot, style, size = 1) {
    const k = this.kit, r = this.rand;
    const y = this.ground(x, z) - 0.3;
    const w = (6 + r() * 3) * size, d = (5 + r() * 2) * size, h1 = 3.4, h2 = 2.8;
    const stone = style === 'ea' ? 'stoneA' : 'stoneE';
    const roof = style === 'ea' ? 'roofA' : style === 'eacc' ? 'roofE' : 'roofN';
    const M = (lx, ly, lz, ry = 0, rx = 0, rz = 0) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      return mat4(x + lx * c + lz * s, y + ly, z - lx * s + lz * c, rot + ry, rx, rz);
    };
    k.add(stone, boxM(w, h1, d), M(0, h1 / 2, 0));
    k.add('plaster', boxM(w + 0.4, h2, d + 0.4), M(0, h1 + h2 / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add('woodDark', boxM(0.3, h2, 0.3), M(sx * (w / 2 + 0.2), h1 + h2 / 2, sz * (d / 2 + 0.2)));
    k.add('woodDark', boxM(w + 0.7, 0.3, d + 0.7), M(0, h1 + 0.1, 0));
    for (const sz of [-1, 1]) for (let i = -1; i <= 1; i++) k.add('woodDark', boxM(0.22, h2 * 1.1, 0.12), M(i * w * 0.3, h1 + h2 / 2, sz * (d / 2 + 0.42), 0, 0, i ? i * 0.5 : 0));
    k.add(roof, roofM(w + 0.4, d + 0.4, 2.8 * size, 0.8), M(0, h1 + h2, 0));
    k.add(stone, boxM(1.1, 3, 1.1), M(w * 0.3, h1 + h2 + 2.2, -d * 0.2));
    k.add('wood', boxM(1.3, 2.3, 0.2), M(0, 1.15, d / 2 + 0.05));
    k.add('woodDark', boxM(1.7, 0.3, 0.3), M(0, 2.4, d / 2 + 0.1));
    const glow = style === 'ea' ? 'glowA' : 'glowE';
    for (const sx of [-1, 1]) {
      k.add(glow, boxM(0.9, 1.0, 0.1), M(sx * w * 0.3, 1.9, d / 2 + 0.03));
      k.add('woodDark', boxM(1.1, 0.14, 0.2), M(sx * w * 0.3, 1.35, d / 2 + 0.08));
      k.add(glow, boxM(0.8, 0.9, 0.1), M(sx * w * 0.28, h1 + 1.3, d / 2 + 0.24));
      k.add(glow, boxM(0.1, 0.9, 0.8), M(sx * (w / 2 + 0.24), h1 + 1.3, 0));
    }
    const R = Math.max(w, d) * 0.5;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const lx = i * w * 0.3, lz = j * d * 0.3;
      this.collide(x + lx * c + lz * s, z - lx * s + lz * c, R * 0.55);
    }
    if (this.rand() < 0.6) this.vfx.addEmitter({ type: 'smoke', x: x + w * 0.3 * Math.cos(rot) - d * 0.2 * Math.sin(rot), y: y + h1 + h2 + 3.8, z: z - w * 0.3 * Math.sin(rot) - d * 0.2 * Math.cos(rot), rate: 1.5, c: 0.55, range: 220 });
  }

  tower(x, z, r, h, stone, roof) {
    const k = this.kit;
    const y = this.ground(x, z) - 0.5;
    k.add(stone, cylM(r, r * 1.08, h, 18), mat4(x, y + h / 2, z));
    k.add(stone, cylM(r * 1.18, r * 1.18, 1.2, 18), mat4(x, y + h - 0.2, z));
    if (roof) k.add(roof, coneM(r * 1.35, r * 2.2, 18), mat4(x, y + h + 0.4 + r * 1.1, z));
    else for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; k.add(stone, boxM(0.8, 1.0, 0.8), mat4(x + Math.cos(a) * r * 1.1, y + h + 0.9, z + Math.sin(a) * r * 1.1, -a)); }
    this.collide(x, z, r + 0.4);
    return y + h;
  }

  wallRing(cx, cz, R, gates, stone, roof) {
    const k = this.kit;
    const segs = 44;
    const gateHalf = 0.16;
    const inGate = (a) => gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gateHalf);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, am = (a0 + a1) / 2;
      if (inGate(am)) continue;
      const x0 = cx + Math.cos(a0) * R, z0 = cz + Math.sin(a0) * R, x1 = cx + Math.cos(a1) * R, z1 = cz + Math.sin(a1) * R;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const len = Math.hypot(x1 - x0, z1 - z0) + 0.4;
      const y = this.ground(mx, mz) - 1;
      const ang = Math.atan2(x1 - x0, z1 - z0);
      k.add(stone, boxM(1.8, 7.5, len), mat4(mx, y + 3.75, mz, ang));
      for (let m = -1; m <= 1; m += 2) k.add(stone, boxM(0.7, 1.0, len * 0.3), mat4(mx + Math.cos(am) * 0.55, y + 8, mz + Math.sin(am) * 0.55, ang, 0, 0, 1, 1, 1));
      for (let t = 0; t <= 3; t++) {
        const f = t / 3;
        this.collide(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, 1.4);
      }
      if (i % 5 === 0) this.tower(x0, z0, 2.6, 11, stone, roof);
    }
    for (const g of gates) {
      for (const s of [-1, 1]) {
        const a = g + s * (gateHalf + 0.01);
        const tx = cx + Math.cos(a) * R, tz = cz + Math.sin(a) * R;
        const top = this.tower(tx, tz, 3, 13, stone, roof);
        this.gateBanner.push({ x: tx + Math.cos(g) * 3.2, y: top - 4.5, z: tz + Math.sin(g) * 3.2, rot: -g + Math.PI / 2 });
        this.brazier(cx + Math.cos(a) * (R + 5), cz + Math.sin(a) * (R + 5));
      }
      const gx = cx + Math.cos(g) * R, gz = cz + Math.sin(g) * R;
      const y = this.ground(gx, gz);
      k.add(stone, boxM(2.2, 2.5, 2 * R * Math.sin(gateHalf) + 1), mat4(gx, y + 9, gz, Math.atan2(-Math.sin(g), Math.cos(g))));
    }
  }

  brazier(x, z, style) {
    const k = this.kit;
    const y = this.ground(x, z);
    k.add('metalDark', cylM(0.18, 0.28, 1.6, 8), mat4(x, y + 0.8, z));
    k.add('metalDark', cylM(0.75, 0.4, 0.5, 12), mat4(x, y + 1.8, z));
    k.add('glowE', cylM(0.62, 0.62, 0.1, 12), mat4(x, y + 2.0, z));
    this.vfx.addEmitter({ type: 'fire', x, y: y + 2.1, z, rate: 26, radius: 0.35, size: 0.8, range: 160 });
    this.light(x, y + 3, z, 0xff8a3a, 30, 26, 1);
    this.collide(x, z, 0.8);
  }

  lanternPost(x, z) {
    const k = this.kit;
    const y = this.ground(x, z);
    k.add('metalDark', cylM(0.08, 0.12, 3.6, 8), mat4(x, y + 1.8, z));
    k.add('metalDark', boxM(0.9, 0.08, 0.08), mat4(x, y + 3.55, z));
    k.add('glowA', boxM(0.34, 0.5, 0.34), mat4(x + 0.35, y + 3.2, z));
    k.add('gold', coneM(0.3, 0.25, 4), mat4(x + 0.35, y + 3.58, z, Math.PI / 4));
    this.light(x + 0.35, y + 3.2, z, 0xa8d8ff, 16, 18);
    this.collide(x, z, 0.4);
  }

  signpost(x, z, boards) {
    const k = this.kit;
    const y = this.ground(x, z);
    k.add('woodDark', cylM(0.14, 0.17, 4.2, 8), mat4(x, y + 2.1, z));
    boards.forEach((b, i) => {
      const tex = signTexture([b.text]);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
      const g = new THREE.BoxGeometry(2.6, 0.55, 0.08);
      const m = new THREE.Mesh(g, mat);
      const a = b.dir;
      m.position.set(x + Math.sin(a) * 1.25, y + 3.5 - i * 0.62, z + Math.cos(a) * 1.25);
      m.rotation.y = a - Math.PI / 2;
      m.castShadow = true;
      this.gfx.scene.add(m);
    });
    this.collide(x, z, 0.5);
  }

  tent(x, z, rot, faction) {
    const k = this.kit;
    const y = this.ground(x, z);
    k.add(faction === 'eacc' ? 'clothE' : 'clothA', coneM(2.4, 3.2, 8), mat4(x, y + 1.6, z, rot));
    k.add('woodDark', cylM(0.06, 0.06, 3.8, 6), mat4(x, y + 1.9, z));
    this.collide(x, z, 2.2);
  }

  campfire(x, z) {
    const k = this.kit;
    const y = this.ground(x, z);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.add('stoneD', boxM(0.4, 0.3, 0.3), mat4(x + Math.cos(a) * 0.8, y + 0.1, z + Math.sin(a) * 0.8, a)); }
    for (let i = 0; i < 3; i++) k.add('woodDark', cylM(0.1, 0.1, 1.4, 6), mat4(x, y + 0.2, z, (i / 3) * Math.PI, Math.PI / 2 - 0.2));
    this.vfx.addEmitter({ type: 'fire', x, y: y + 0.3, z, rate: 30, radius: 0.3, size: 0.9, range: 150 });
    this.vfx.addEmitter({ type: 'smoke', x, y: y + 1.8, z, rate: 1.5, c: 0.35, range: 150 });
    this.light(x, y + 1.5, z, 0xff8a3a, 26, 20, 1);
  }

  crate(x, z, s = 1, rot = 0) {
    const y = this.ground(x, z);
    this.kit.add('wood', boxM(s, s, s), mat4(x, y + s / 2, z, rot));
    this.collide(x, z, s * 0.7);
  }

  // ------------------------------------------------------------------ sites
  _eaccCapital() {
    const s = SITES.eacc, k = this.kit, r = this.rand;
    this.gateBanner = [];
    this.wallRing(s.x, s.z, 57, [Math.PI, Math.atan2(86 - s.z, 292 - s.x)], 'stoneE', 'roofE');
    this.banners.eacc.push(...this.gateBanner);
    // central launch complex
    const y = this.ground(s.x, s.z);
    k.add('metalDark', cylM(9, 10, 1.4, 28), mat4(s.x, y + 0.5, s.z));
    k.add('glowE', cylM(9.05, 9.05, 0.15, 28, 0.5, true), mat4(s.x, y + 1.25, s.z));
    const rocketX = s.x + 2, rocketZ = s.z;
    const prof = [[0.001, 0], [2.0, 0], [2.2, 3], [2.2, 22], [2.0, 25], [1.4, 28], [0.6, 30.5], [0.001, 31.5]];
    const body = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 28);
    k.add('metal', body, mat4(rocketX, y + 4.5, rocketZ));
    k.add('metalDark', cylM(2.24, 2.24, 0.6, 28), mat4(rocketX, y + 4.5 + 14, rocketZ));
    k.add('metalDark', cylM(2.24, 2.24, 0.6, 28), mat4(rocketX, y + 4.5 + 21, rocketZ));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.add('metalDark', boxM(0.35, 5, 3.2), mat4(rocketX + Math.cos(a) * 2.9, y + 6.8, rocketZ + Math.sin(a) * 2.9, -a));
      k.add('metalDark', coneM(0.8, 1.6, 12), mat4(rocketX + Math.cos(a) * 1.0, y + 3.8, rocketZ + Math.sin(a) * 1.0, 0, Math.PI));
      k.add('glowE', cylM(0.62, 0.62, 0.1, 12), mat4(rocketX + Math.cos(a) * 1.0, y + 3.0, rocketZ + Math.sin(a) * 1.0));
    }
    this.vfx.addEmitter({ type: 'smoke', x: rocketX, y: y + 2, z: rocketZ, rate: 3, c: 0.8, radius: 3, range: 300 });
    this.vfx.addEmitter({ type: 'fire', x: rocketX, y: y + 2.6, z: rocketZ, rate: 18, radius: 1.3, size: 1.1, range: 200 });
    this.light(rocketX, y + 4, rocketZ, 0xff9a4a, 40, 30, 0.5);
    // gantry
    const gx = rocketX - 6.5, gz = rocketZ;
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) k.add('metalDark', boxM(0.35, 36, 0.35), mat4(gx + dx, y + 18, gz + dz));
    for (let h = 2; h < 36; h += 3) {
      k.add('metalDark', boxM(2.9, 0.22, 0.22), mat4(gx, y + h, gz - 1.3));
      k.add('metalDark', boxM(2.9, 0.22, 0.22), mat4(gx, y + h, gz + 1.3));
      k.add('metalDark', boxM(0.22, 0.22, 2.9), mat4(gx - 1.3, y + h, gz));
      k.add('metalDark', boxM(0.22, 0.22, 2.9), mat4(gx + 1.3, y + h, gz));
      k.add('metalDark', boxM(0.12, 4.2, 0.12), mat4(gx, y + h + 1.5, gz - 1.3, 0, 0, 0.78));
    }
    k.add('metal', boxM(4.5, 0.4, 1.2), mat4(gx + 3, y + 27, gz));
    k.add('glowE', boxM(0.3, 0.3, 0.3), mat4(gx, y + 36.3, gz));
    this.light(gx, y + 37, gz, 0xff4a2a, 12, 20);
    this.collide(rocketX, rocketZ, 3.2); this.collide(gx, gz, 2.2);
    // gigaforge hall
    const hx = s.x + 6, hz = s.z - 30, hy = this.ground(hx, hz) - 0.4;
    k.add('stoneE', boxM(28, 9, 13), mat4(hx, hy + 4.5, hz));
    k.add('metal', roofM(28, 13, 4.5, 1), mat4(hx, hy + 9, hz));
    for (let i = -1; i <= 1; i++) {
      k.add('stoneE', cylM(1.1, 1.3, 9, 12), mat4(hx + i * 8, hy + 13.5, hz - 3));
      k.add('metalDark', cylM(1.25, 1.25, 0.6, 12), mat4(hx + i * 8, hy + 18, hz - 3));
      this.vfx.addEmitter({ type: 'smoke', x: hx + i * 8, y: hy + 18.5, z: hz - 3, rate: 2.4, c: 0.25, range: 320 });
      this.vfx.addEmitter({ type: 'fire', x: hx + i * 8, y: hy + 18.3, z: hz - 3, rate: 6, radius: 0.5, size: 0.6, range: 200 });
    }
    k.add('glowE', boxM(5, 5.5, 0.3), mat4(hx, hy + 2.75, hz + 6.55));
    k.add('metalDark', boxM(6, 0.6, 0.6), mat4(hx, hy + 5.8, hz + 6.7));
    for (const sx of [-1, 1]) for (let i = 1; i <= 3; i++) k.add('glowE', boxM(1.4, 2.2, 0.2), mat4(hx + sx * (3.5 + i * 2.8), hy + 5, hz + 6.55));
    this.light(hx, hy + 3, hz + 8, 0xff7a2a, 40, 26, 0.6);
    for (let i = -6; i <= 6; i += 3) for (let j = -2; j <= 2; j += 2) this.collide(hx + i * 2, hz + j * 1.3, 3);
    this.vfx.addEmitter({ type: 'fire', x: hx, y: hy + 0.5, z: hz + 6.2, rate: 20, radius: 1.8, size: 0.9, range: 150 });
    // houses
    for (const a of [-2.35, -0.75, -0.2, 0.35, 0.9, 1.35, 2.45]) {
      const R = 38 + r() * 4;
      const x = s.x + Math.cos(a) * R, z = s.z + Math.sin(a) * R;
      this.house(x, z, Math.atan2(s.x - x, s.z - z), 'eacc');
    }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; this.brazier(s.x + Math.cos(a) * 14, s.z + Math.sin(a) * 14); }
    for (let i = 0; i < 6; i++) this.crate(s.x - 12 + r() * 6, s.z + 16 + r() * 5, 0.9 + r() * 0.4, r() * 3);
    this.banners.eacc.push({ x: s.x + 14, y: y + 7, z: s.z + 12, rot: 0.8, pole: true }, { x: s.x + 14, y: y + 7, z: s.z - 12, rot: 2.3, pole: true });
  }

  _eaCapital() {
    const s = SITES.ea, k = this.kit, r = this.rand;
    this.gateBanner = [];
    this.wallRing(s.x, s.z, 57, [0, Math.atan2(86 - s.z, -292 - s.x)], 'stoneA', 'roofA');
    this.banners.ea.push(...this.gateBanner);
    const y = this.ground(s.x, s.z);
    // temple of the long future
    k.add('marble', cylM(14, 15, 1.2, 36), mat4(s.x, y + 0.3, s.z));
    k.add('marble', cylM(12.5, 13.5, 0.8, 36), mat4(s.x, y + 1.2, s.z));
    const N = 14, CR = 11;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const cx = s.x + Math.cos(a) * CR, cz = s.z + Math.sin(a) * CR;
      k.add('marble', cylM(0.72, 0.82, 9, 14), mat4(cx, y + 6.1, cz));
      k.add('marble', boxM(2, 0.6, 2), mat4(cx, y + 10.9, cz, -a));
      k.add('gold', torusM(0.8, 0.1), mat4(cx, y + 10.5, cz, 0, Math.PI / 2));
      this.collide(cx, cz, 1.0);
    }
    k.add('marble', cylM(12.4, 12.4, 1.6, 36, 0.5, true), mat4(s.x, y + 12, s.z));
    const dome = new THREE.SphereGeometry(12, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    k.add('roofA', dome, mat4(s.x, y + 12.6, s.z));
    for (let i = 0; i < 12; i++) k.add('gold', boxM(0.3, 0.3, 12.5), mat4(s.x, y + 12.8, s.z, (i / 12) * Math.PI, 0, 0, 1, 1, 1).multiply(new THREE.Matrix4()));
    k.add('gold', cylM(0.4, 0.9, 6, 12), mat4(s.x, y + 27, s.z));
    k.add('gold', coneM(0.4, 3, 12), mat4(s.x, y + 31.5, s.z));
    k.add('marble', cylM(1.4, 1.8, 3, 16), mat4(s.x, y + 3, s.z));
    this.lodestar = { x: s.x, y: y + 36, z: s.z };
    this.light(s.x, y + 6, s.z, 0xbfe4ff, 30, 26);
    // library tower
    const lx = s.x - 14, lz = s.z - 32;
    const ly = this.ground(lx, lz) - 0.4;
    k.add('stoneA', cylM(5, 5.6, 24, 24), mat4(lx, ly + 12, lz));
    k.add('stoneA', cylM(5.8, 5.8, 1, 24), mat4(lx, ly + 24, lz));
    k.add('roofA', coneM(6.6, 10, 24), mat4(lx, ly + 29.5, lz));
    k.add('gold', coneM(0.3, 3, 8), mat4(lx, ly + 36, lz));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; for (const h of [6, 12, 18]) k.add('glowA', boxM(0.9, 1.8, 0.2), mat4(lx + Math.cos(a) * 5.35, ly + h, lz + Math.sin(a) * 5.35, -a + Math.PI / 2)); }
    this.collide(lx, lz, 6);
    // fountain
    const fx = s.x + 22, fz = s.z, fy = this.ground(fx, fz);
    k.add('marble', cylM(4.2, 4.4, 0.9, 28), mat4(fx, fy + 0.3, fz));
    k.add('water', cylM(3.8, 3.8, 0.1, 28), mat4(fx, fy + 0.8, fz));
    k.add('marble', cylM(0.5, 0.8, 3, 12), mat4(fx, fy + 1.8, fz));
    k.add('marble', cylM(1.6, 0.6, 0.5, 16), mat4(fx, fy + 3.3, fz));
    this.vfx.addEmitter({ type: 'sparkle', x: fx, y: fy + 3.5, z: fz, rate: 30, radius: 1.2, h: 0.8, size: 0.14, color: [0.8, 1.6, 2.4], range: 120 });
    this.collide(fx, fz, 4.4);
    // houses & lanterns
    for (const a of [2.35, -2.5, -1.95, -1.1, 0.75, 1.9, 2.8]) {
      const R = 38 + r() * 4;
      const x = s.x + Math.cos(a) * R, z = s.z + Math.sin(a) * R;
      this.house(x, z, Math.atan2(s.x - x, s.z - z), 'ea');
    }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.13; this.lanternPost(s.x + Math.cos(a) * 20, s.z + Math.sin(a) * 20); }
    this.banners.ea.push({ x: s.x + 16, y: y + 7, z: s.z + 12, rot: -0.8, pole: true }, { x: s.x + 16, y: y + 7, z: s.z - 12, rot: -2.3, pole: true });
  }

  _spire() {
    const s = SITES.spire, k = this.kit, r = this.rand;
    const y = this.ground(s.x, s.z);
    this.spireBase = new V3(s.x, y, s.z);
    k.add('stoneD', cylM(8, 10, 3, 8), mat4(s.x, y + 0.5, s.z, Math.PI / 8));
    const ob = new THREE.CylinderGeometry(2.6, 5.2, 54, 4, 6);
    k.add('spire', ob, mat4(s.x, y + 29, s.z, Math.PI / 4));
    k.add('spire', new THREE.CylinderGeometry(0.01, 2.6, 5, 4, 1), mat4(s.x, y + 58.5, s.z, Math.PI / 4));
    this.collide(s.x, s.z, 6.5);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r() * 0.2;
      const R = 34 + r() * 3;
      const px = s.x + Math.cos(a) * R, pz = s.z + Math.sin(a) * R;
      const py = this.ground(px, pz);
      const h = 3 + r() * 8;
      if (r() < 0.25) {
        k.add('stoneD', cylM(0.9, 1, 7, 10), mat4(px, py + 0.8, pz, r() * 6, Math.PI / 2, 0));
      } else {
        k.add('stoneD', cylM(0.9, 1.05, h, 10), mat4(px, py + h / 2 - 0.3, pz));
        k.add('stoneD', boxM(2.4, 0.7, 2.4), mat4(px, py + 0.3, pz, a));
        if (h > 8) k.add('stoneD', boxM(2.2, 0.6, 2.2), mat4(px, py + h, pz, a));
        this.collide(px, pz, 1.4);
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = s.x + Math.cos(a) * 11, z = s.z + Math.sin(a) * 11;
      k.add('glowC', new THREE.OctahedronGeometry(0.9, 0), mat4(x, this.ground(x, z) + 1.5, z, a, 0, 0, 0.8, 2.2, 0.8));
    }
    this.vfx.addEmitter({ type: 'swirl', x: s.x, y: y + 2, z: s.z, rate: 25, radius: 9, h: 50, size: 0.5, color: [0.4, 1.6, 2.6], range: 400 });
    this.light(s.x, y + 8, s.z, 0x5ad8ff, 50, 40);
    // floating rings (animated)
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x0a1a22, emissive: 0x3ae0ff, emissiveIntensity: 2.5, metalness: 0.5, roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7 + i * 2.2, 0.28, 8, 64), ringMat);
      ring.position.set(s.x, y + 18 + i * 13, s.z);
      ring.rotation.x = Math.PI / 2;
      this.gfx.scene.add(ring);
      this.animated.push({ obj: ring, fn: (o, t) => { o.rotation.x = Math.PI / 2 + Math.sin(t * 0.3 + i) * 0.25; o.rotation.y = t * (0.2 + i * 0.1) * (i % 2 ? 1 : -1); o.position.y = y + 18 + i * 13 + Math.sin(t * 0.6 + i) * 0.8; } });
    }
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(3, 0), new THREE.MeshStandardMaterial({ color: 0x0a1a22, emissive: 0x7af0ff, emissiveIntensity: 3.2, roughness: 0.1, metalness: 0.4, flatShading: true }));
    cap.position.set(s.x, y + 66, s.z);
    this.gfx.scene.add(cap);
    this.animated.push({ obj: cap, fn: (o, t) => { o.rotation.y = t * 0.5; o.position.y = y + 66 + Math.sin(t * 0.8) * 1.2; } });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 600, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.8, 1.2), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    beam.position.set(s.x, y + 66 + 300, s.z);
    this.gfx.scene.add(beam);
    this.animated.push({ obj: beam, fn: (o, t) => { o.material.opacity = 0.12 + Math.sin(t * 1.3) * 0.05; } });
    this.spireRunes = this.vfx.decal(3, { x: s.x, z: s.z }, 30, 0x3ae0ff, 1, { persistent: true, alpha: 0.55, lift: 0.1 });
  }

  _crossing() {
    const s = SITES.cross, k = this.kit;
    const y = this.ground(s.x, s.z);
    this.signpost(s.x - 5, s.z + 4, [
      { text: 'Gigaforge Citadel  >', dir: Math.PI / 2 },
      { text: '<  Lumen Sanctum', dir: -Math.PI / 2 },
      { text: 'Singularity Spire  ^', dir: Math.PI },
      { text: 'Compute Fields  v', dir: 0 },
    ]);
    const ox = s.x + 4, oz = s.z - 5;
    k.add('stoneA', cylM(4.5, 4.8, 0.6, 24), mat4(ox, this.ground(ox, oz) + 0.1, oz));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = ox + Math.cos(a) * 6.2, z = oz + Math.sin(a) * 6.2;
      k.add('stoneD', boxM(1.1, 3.2 + (i % 3) * 0.6, 0.8), mat4(x, this.ground(x, z) + 1.4, z, -a));
      this.collide(x, z, 0.9);
    }
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0x1a1a08, emissive: 0xffe08a, emissiveIntensity: 2.6, flatShading: true }));
    cr.position.set(ox, y + 4.5, oz);
    this.gfx.scene.add(cr);
    this.animated.push({ obj: cr, fn: (o, t) => { o.rotation.y = t; o.position.y = y + 4.5 + Math.sin(t * 1.4) * 0.3; } });
    this.vfx.addEmitter({ type: 'sparkle', x: ox, y: y + 1, z: oz, rate: 8, radius: 3, h: 4, size: 0.18, color: [2.4, 2.0, 0.8], range: 120 });
    this.light(ox, y + 4.5, oz, 0xffe08a, 20, 18);
    this.house(s.x - 16, s.z + 14, 0.3, 'neutral', 1.1);
    const wy = this.ground(s.x + 10, s.z + 10);
    k.add('stoneE', cylM(1.4, 1.5, 1.1, 16, 0.5, true), mat4(s.x + 10, wy + 0.5, s.z + 10));
    k.add('woodDark', boxM(0.2, 2.6, 0.2), mat4(s.x + 8.8, wy + 1.3, s.z + 10));
    k.add('woodDark', boxM(0.2, 2.6, 0.2), mat4(s.x + 11.2, wy + 1.3, s.z + 10));
    k.add('roofN', roofM(2.8, 2.4, 1.1, 0.3), mat4(s.x + 10, wy + 2.6, s.z + 10, Math.PI / 2));
    this.collide(s.x + 10, s.z + 10, 1.6);
    this.campfire(s.x + 12, s.z - 2);
  }

  _camp(site, faction) {
    const r = this.rand;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      this.tent(site.x + Math.cos(a) * 9, site.z + Math.sin(a) * 9, a, faction);
    }
    this.campfire(site.x, site.z);
    for (let i = 0; i < 5; i++) this.crate(site.x + 5 + r() * 3, site.z - 5 + r() * 3, 0.8 + r() * 0.4, r() * 3);
    this.banners[faction].push({ x: site.x - 4, y: this.ground(site.x - 4, site.z + 4) + 5, z: site.z + 4, rot: faction === 'eacc' ? -0.8 : 0.8, pole: true });
  }

  _mill() {
    const s = SITES.mill, k = this.kit;
    const y = this.ground(s.x, s.z) - 0.3;
    k.add('stoneE', cylM(2.4, 3.3, 12, 16), mat4(s.x, y + 6, s.z));
    k.add('woodDark', cylM(3.4, 3.4, 0.4, 16), mat4(s.x, y + 12, s.z));
    k.add('roofN', coneM(3.6, 4.2, 16), mat4(s.x, y + 14.2, s.z));
    k.add('wood', boxM(1.3, 2.4, 0.3), mat4(s.x, y + 1.2, s.z + 3.15));
    k.add('rack', boxM(1.2, 2.0, 0.8), mat4(s.x + 3.5, y + 1.0, s.z + 1.5, 0.4));
    k.add('rack', boxM(1.2, 2.0, 0.8), mat4(s.x + 4.2, y + 1.0, s.z - 0.3, 0.4));
    this.collide(s.x, s.z, 3.6);
    const hub = new THREE.Group();
    hub.position.set(s.x, y + 11, s.z + 3.4);
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xefe6d0, roughness: 0.9, side: THREE.DoubleSide });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 4) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9, 0.2), beamMat);
      b.position.y = 4.5;
      const sail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 7, 0.05), sailMat);
      sail.position.set(1.05, 5.2, 0);
      b.castShadow = sail.castShadow = true;
      arm.add(b, sail);
      hub.add(arm);
    }
    const hubC = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 12), beamMat);
    hubC.rotation.x = Math.PI / 2;
    hub.add(hubC);
    this.gfx.scene.add(hub);
    this.animated.push({ obj: hub, fn: (o, t, dt) => { o.rotation.z -= dt * 0.6; } });
    const rack = this.mats.rack;
    this.animated.push({ obj: rack, fn: (o, t) => { o.emissiveIntensity = 0.9 + Math.sin(t * 8) * 0.3; } });
  }

  _fences() {
    const k = this.kit;
    for (const f of FIELDS) {
      const c = Math.cos(f.rot), s = Math.sin(f.rot);
      const hw = f.w / 2 + 0.8, hh = f.h / 2 + 0.8;
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      for (let e = 0; e < 4; e++) {
        const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4];
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.ceil(L / 3);
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n;
          if (e === 2 && Math.abs(t0 - 0.5) < 0.08) continue;
          const lx = ax + (bx - ax) * t0, lz = az + (bz - az) * t0;
          const wx = f.x + lx * c + lz * s, wz = f.z - lx * s + lz * c;
          const y = this.ground(wx, wz);
          k.add('woodDark', boxM(0.16, 1.3, 0.16), mat4(wx, y + 0.55, wz, 0, 0, (Math.random() - 0.5) * 0.08));
          const lx2 = ax + (bx - ax) * t1, lz2 = az + (bz - az) * t1;
          const wx2 = f.x + lx2 * c + lz2 * s, wz2 = f.z - lx2 * s + lz2 * c;
          const mx = (wx + wx2) / 2, mz = (wz + wz2) / 2, my = this.ground(mx, mz);
          const ang = Math.atan2(wx2 - wx, wz2 - wz);
          const len = Math.hypot(wx2 - wx, wz2 - wz);
          k.add('wood', boxM(0.08, 0.12, len), mat4(mx, my + 0.95, mz, ang));
          k.add('wood', boxM(0.08, 0.12, len), mat4(mx, my + 0.5, mz, ang));
        }
      }
    }
  }

  _ruins() {
    const s = SITES.ruins, k = this.kit, r = this.rand;
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, R = 8 + r() * 20;
      const x = s.x + Math.cos(a) * R, z = s.z + Math.sin(a) * R, y = this.ground(x, z);
      if (r() < 0.5) {
        const h = 2 + r() * 6;
        k.add('stoneA', cylM(0.7, 0.8, h, 10), mat4(x, y + h / 2 - 0.2, z, 0, (r() - 0.5) * 0.15, (r() - 0.5) * 0.15));
        this.collide(x, z, 1);
      } else {
        const L = 4 + r() * 6, h = 1.5 + r() * 3;
        k.add('stoneA', boxM(L, h, 0.9), mat4(x, y + h / 2 - 0.3, z, r() * 3));
        k.add('stoneA', boxM(L * 0.5, h * 0.6, 0.9), mat4(x, y + h, z, r() * 3));
      }
    }
    const hx = s.x + 6, hz = s.z + 4, hy = this.ground(hx, hz);
    k.add('marble', new THREE.SphereGeometry(3.2, 20, 14), mat4(hx, hy + 2, hz, 0.8, 0.5, 0.35));
    k.add('marble', boxM(0.9, 1.6, 1.4), mat4(hx + 1.8, hy + 2.2, hz + 2.2, 0.8, 0.5, 0.35));
    k.add('glowP', boxM(1.1, 0.4, 0.2), mat4(hx + 1.5, hy + 3.2, hz + 2.7, 0.8, 0.5, 0.35));
    this.collide(hx, hz, 3.4);
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2, R = 5 + r() * 18;
      const x = s.x + Math.cos(a) * R, z = s.z + Math.sin(a) * R;
      k.add('glowP', new THREE.OctahedronGeometry(0.6, 0), mat4(x, this.ground(x, z) + 0.8, z, r() * 3, 0, 0, 0.7, 1.8 + r(), 0.7));
    }
    const words = ['AGI SOON', '10x', 'TO THE MOON', 'NEXT WEEK', 'SCALE IS ALL', 'VIBES'];
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSpriteTexture(words[i]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      const a = (i / 6) * Math.PI * 2;
      const x = s.x + Math.cos(a) * 16, z = s.z + Math.sin(a) * 16, y = this.ground(x, z) + 5 + (i % 3);
      sp.position.set(x, y, z);
      sp.scale.set(6, 1.5, 1);
      this.gfx.scene.add(sp);
      this.animated.push({ obj: sp, fn: (o, t) => { o.position.y = y + Math.sin(t * 0.8 + i) * 0.6; o.material.opacity = 0.5 + Math.sin(t * 1.3 + i * 2) * 0.3; } });
    }
    this.vfx.addEmitter({ type: 'sparkle', x: s.x, y: this.ground(s.x, s.z), z: s.z, rate: 10, radius: 20, h: 3, size: 0.25, color: [1.8, 0.8, 2.6], range: 160 });
  }

  _quarry() {
    const k = this.kit, r = this.rand;
    const cx = 172, cz = -92;
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, R = 6 + r() * 30;
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, y = this.ground(x, z);
      const n = 2 + Math.floor(r() * 5);
      for (let j = 0; j < n; j++) k.add(j % 2 ? 'paper' : 'plaster', boxM(1.4, 0.35, 1.0), mat4(x + (r() - 0.5) * 0.2, y + 0.18 + j * 0.36, z + (r() - 0.5) * 0.2, r() * 0.5));
      k.add('redtape', boxM(1.45, 0.08, 0.2), mat4(x, y + n * 0.18, z, 0));
      this.collide(x, z, 0.9);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = cx + Math.cos(a) * 38, z = cz + Math.sin(a) * 38, y = this.ground(x, z);
      k.add('woodDark', boxM(0.15, 1.6, 0.15), mat4(x, y + 0.8, z));
      const x2 = cx + Math.cos(a + 0.628) * 38, z2 = cz + Math.sin(a + 0.628) * 38;
      const mx = (x + x2) / 2, mz = (z + z2) / 2, my = this.ground(mx, mz);
      k.add('redtape', boxM(0.05, 0.25, Math.hypot(x2 - x, z2 - z)), mat4(mx, my + 1.25, mz, Math.atan2(x2 - x, z2 - z)));
    }
    const y = this.ground(cx, cz);
    k.add('woodDark', cylM(0.8, 1.1, 4, 12), mat4(cx, y + 5, cz));
    k.add('redtape', cylM(3, 3, 2, 24), mat4(cx, y + 2, cz));
    k.add('glowE', cylM(3.05, 3.05, 0.2, 24), mat4(cx, y + 1, cz));
    this.collide(cx, cz, 3.2);
  }

  _raceWastes() {
    const k = this.kit, r = this.rand;
    const cx = -172, cz = -92;
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2, R = 8 + r() * 28;
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, y = this.ground(x, z);
      const n = 2 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) k.add('rubber', new THREE.TorusGeometry(0.55, 0.22, 8, 16), mat4(x, y + 0.22 + j * 0.42, z, 0, Math.PI / 2));
      this.collide(x, z, 0.8);
    }
    const y = this.ground(cx, cz);
    for (const s of [-1, 1]) k.add('metalDark', boxM(0.5, 7, 0.5), mat4(cx + s * 7, y + 3.5, cz));
    const arch = new THREE.Mesh(new THREE.BoxGeometry(14.5, 1.6, 0.2), this.mats.checker);
    arch.position.set(cx, y + 6.6, cz);
    arch.castShadow = true;
    this.gfx.scene.add(arch);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * 30, z = cz + Math.sin(a) * 30, fy = this.ground(x, z);
      k.add('metalDark', cylM(0.06, 0.06, 4, 6), mat4(x, fy + 2, z));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0, 6, 3), this.mats.checker);
      flag.position.set(x + 0.8, fy + 3.5, z);
      this.gfx.scene.add(flag);
      this.animated.push({ obj: flag, fn: (o, t) => { o.rotation.y = Math.sin(t * 3 + i) * 0.3; } });
    }
  }

  _hollow() {
    const k = this.kit, r = this.rand;
    const cx = -176, cz = -285;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const x = cx + Math.cos(a) * 17, z = cz + Math.sin(a) * 17, y = this.ground(x, z);
      const h = 5 + r() * 5;
      k.add('stoneD', boxM(1.6, h, 1.2), mat4(x, y + h / 2 - 0.5, z, -a, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2));
      k.add('glowG', boxM(0.2, h * 0.6, 0.1), mat4(x + Math.cos(a) * -0.62, y + h / 2, z + Math.sin(a) * -0.62, -a));
      this.collide(x, z, 1.3);
    }
    this.vfx.decal(3, { x: cx, z: cz }, 13, 0x3aff7a, 1, { persistent: true, alpha: 0.5 });
    this.vfx.addEmitter({ type: 'sparkle', x: cx, y: this.ground(cx, cz), z: cz, rate: 8, radius: 14, h: 3, size: 0.22, color: [0.6, 2.6, 1.0], range: 150 });
  }

  _dock() {
    const k = this.kit;
    let sx = LAKE.x + LAKE.r + 12, sz = LAKE.z - 8;
    for (let i = 0; i < 40 && this.ground(sx, sz) > 0.6; i++) sx -= 1;
    for (let i = 0; i < 9; i++) {
      const x = sx - i * 1.6 + 3, z = sz;
      k.add('wood', boxM(1.5, 0.18, 3), mat4(x, 0.9, z));
      if (i % 2 === 0) for (const s of [-1, 1]) k.add('woodDark', cylM(0.14, 0.14, 3.5, 6), mat4(x, -0.6, z + s * 1.4));
    }
  }

  _buildBanners() {
    const tu = this.time;
    for (const fac of ['eacc', 'ea']) {
      const list = this.banners[fac];
      if (!list.length) continue;
      const mat = new THREE.MeshStandardMaterial({ map: bannerTexture(fac), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = tu;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
            float ph = instanceMatrix[3][0] * 0.3 + instanceMatrix[3][2] * 0.2;
            float f = 1.0 - uv.y;
            transformed.z += sin(uTime * 2.4 + position.y * 1.6 + ph) * 0.18 * f + sin(uTime * 4.1 + position.x * 3.0) * 0.04 * f;
            transformed.x += sin(uTime * 1.7 + ph) * 0.05 * f;`);
      };
      mat.customProgramCacheKey = () => 'banner-v1';
      const geo = new THREE.PlaneGeometry(2.2, 5.5, 4, 12);
      geo.translate(0, -2.75, 0);
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((b, i) => inst.setMatrixAt(i, mat4(b.x, b.y, b.z, b.rot)));
      inst.castShadow = true;
      inst.computeBoundingSphere();
      this.gfx.scene.add(inst);
      const poles = list.filter((b) => b.pole);
      for (const b of poles) {
        const gy = this.ground(b.x, b.z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, b.y - gy + 1.2, 8), this.mats.woodDark);
        pole.position.set(b.x - Math.cos(b.rot) * 1.15, gy + (b.y - gy + 1.2) / 2, b.z + Math.sin(b.rot) * 1.15);
        pole.castShadow = true;
        this.gfx.scene.add(pole);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), this.mats.gold);
        bar.rotation.z = Math.PI / 2; bar.rotation.y = b.rot;
        bar.position.set(b.x, b.y + 0.05, b.z);
        this.gfx.scene.add(bar);
        this.collide(pole.position.x, pole.position.z, 0.3);
      }
    }
  }

  update(time, dt, night) {
    this.time.value = time;
    for (const a of this.animated) a.fn(a.obj, time, dt);
    const g = 0.35 + night * 1.9;
    this.mats.glowE.emissiveIntensity = g * 1.1;
    this.mats.glowA.emissiveIntensity = g;
  }
}

function torusM(R, r) { return new THREE.TorusGeometry(R, r, 8, 20); }
