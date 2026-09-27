import * as THREE from 'three';
import { mulberry32 } from '../shared/rng.js';
import { taperedTube } from './foliage.js';

const V3 = THREE.Vector3;
const col = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));

// Material spec used per vertex: colour, roughness, metalness, emissive, fresnel rim.
export const M = (c, r = 0.8, m = 0, e = null, ei = 1, f = 0) => ({ c: col(c), r, m, e: e ? col(e).multiplyScalar(ei) : new THREE.Color(0, 0, 0), f });

// ------------------------------------------------------------------ rigid-skinned mesh builder
export class RigBuilder {
  constructor() {
    this.bones = [];
    this.by = {};
    this.P = []; this.N = []; this.C = []; this.RM = []; this.E = []; this.S = []; this.I = [];
    this.v = 0;
    this._m = new THREE.Matrix4();
    this._n = new THREE.Matrix3();
  }
  bone(name, parent, x, y, z) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) this.by[parent].add(b);
    b.userData.index = this.bones.length;
    this.bones.push(b);
    this.by[name] = b;
    return b;
  }
  ready() { this.bones[0].updateMatrixWorld(true); }
  part(geo, boneName, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    const bone = this.by[boneName];
    let local = new THREE.Matrix4().compose(new V3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new V3(...s));
    if (this.headScale && (boneName === 'head' || boneName === 'eyes')) local = new THREE.Matrix4().makeScale(this.headScale, this.headScale, this.headScale).multiply(local);
    const m = this._m.multiplyMatrices(bone.matrixWorld, local);
    const nm = this._n.getNormalMatrix(m);
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const base = this.v;
    const tv = new V3();
    const bi = bone.userData.index;
    for (let i = 0; i < pos.count; i++) {
      tv.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m);
      this.P.push(tv.x, tv.y, tv.z);
      tv.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(nm).normalize();
      this.N.push(tv.x, tv.y, tv.z);
      this.C.push(mat.c.r, mat.c.g, mat.c.b);
      this.RM.push(mat.r, mat.m);
      this.E.push(mat.e.r, mat.e.g, mat.e.b, mat.f);
      this.S.push(bi, 0, 0, 0);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.I.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.I.push(base + i);
    this.v += pos.count;
    const det = m.determinant();
    if (det < 0) {
      for (let i = this.I.length - (geo.index ? geo.index.count : pos.count); i < this.I.length; i += 3) {
        const t = this.I[i + 1]; this.I[i + 1] = this.I[i + 2]; this.I[i + 2] = t;
      }
    }
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aRM', new THREE.Float32BufferAttribute(this.RM, 2));
    g.setAttribute('aEmis', new THREE.Float32BufferAttribute(this.E, 4));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.S, 4));
    const w = new Float32Array((this.S.length / 4) * 4);
    for (let i = 0; i < w.length; i += 4) w[i] = 1;
    g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(g, material);
    mesh.add(this.bones[0]);
    mesh.bind(new THREE.Skeleton(this.bones));
    mesh.boundingSphere = g.boundingSphere.clone();
    mesh.boundingSphere.radius *= 1.6;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

export function makeCharMaterial() {
  const u = { uFlash: { value: new THREE.Color(0, 0, 0) }, uGlow: { value: 0 }, uGlowColor: { value: new THREE.Color(1, 0.7, 0.3) }, uFade: { value: 1 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM; attribute vec4 aEmis; varying vec2 vRM; varying vec4 vEmis;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM; vEmis = aEmis;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM; varying vec4 vEmis; uniform vec3 uFlash; uniform float uGlow; uniform vec3 uGlowColor; uniform float uFade;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEmis.rgb * (1.0 + uGlow * 1.5);')
      .replace('#include <opaque_fragment>', `
{ vec3 vv = normalize(vViewPosition); float fr = pow(1.0 - saturate(dot(normal, vv)), 2.5);
  outgoingLight += vEmis.a * fr * (vEmis.rgb + diffuseColor.rgb) * 2.5 + uGlowColor * uGlow * fr * 2.0 + uFlash;
  outgoingLight += diffuseColor.rgb * fr * 0.18; }
if (uFade < 0.999) { if (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > uFade) discard; }
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'char-v1';
  mat.userData.u = u;
  return mat;
}

// ------------------------------------------------------------------ geometry helpers
export const G = {
  sphere: (r, w = 14, h = 10, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, w, h, ps, pl, ts, tl),
  capsule: (r, l, cs = 4, rs = 10) => new THREE.CapsuleGeometry(r, l, cs, rs),
  cyl: (rt, rb, h, s = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open),
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  torus: (R, r, rs = 8, ts = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, rs, ts, arc),
  cone: (r, h, s = 10) => new THREE.ConeGeometry(r, h, s),
  lathe: (pts, s = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), s),
  ico: (r, d = 1) => new THREE.IcosahedronGeometry(r, d),
  oct: (r) => new THREE.OctahedronGeometry(r, 0),
};

// ------------------------------------------------------------------ humanoid
export function humanoidSkeleton(rb, look) {
  const bw = look.build || 1;
  const cape = !!look.cape;
  rb.bone('root', null, 0, 0, 0);
  rb.bone('hips', 'root', 0, 0.98, 0);
  rb.bone('spine', 'hips', 0, 0.12, 0);
  rb.bone('chest', 'spine', 0, 0.24, 0);
  rb.bone('neck', 'chest', 0, 0.3, 0);
  rb.bone('head', 'neck', 0, 0.115, 0.012);
  const hs = look.headScale || 1.27;
  rb.headScale = hs;
  rb.bone('eyes', 'head', 0, 0.02 * hs, 0.1 * hs);
  rb.bone('shoulderL', 'chest', 0.25 * bw, 0.235, 0);
  rb.bone('elbowL', 'shoulderL', 0, -0.29, 0);
  rb.bone('handL', 'elbowL', 0, -0.27, 0);
  rb.bone('shoulderR', 'chest', -0.25 * bw, 0.235, 0);
  rb.bone('elbowR', 'shoulderR', 0, -0.29, 0);
  rb.bone('handR', 'elbowR', 0, -0.27, 0);
  const hw = 0.118 * Math.sqrt(bw);
  rb.bone('thighL', 'hips', hw, -0.03, 0);
  rb.bone('kneeL', 'thighL', 0, -0.45, 0);
  rb.bone('footL', 'kneeL', 0, -0.43, 0);
  rb.bone('thighR', 'hips', -hw, -0.03, 0);
  rb.bone('kneeR', 'thighR', 0, -0.45, 0);
  rb.bone('footR', 'kneeR', 0, -0.43, 0);
  if (cape) {
    rb.bone('capeA', 'chest', 0, 0.24, -0.16 * (1 + (look.belly || 0) * 0.3));
    rb.bone('capeB', 'capeA', 0, -0.44, 0);
    rb.bone('capeC', 'capeB', 0, -0.44, 0);
  }
  rb.ready();
}

function addHair(rb, look, hairM, headR, rand) {
  const style = look.hair;
  const cap = (scale = 1.06, tl = 0.52, rx = -0.42) => rb.part(G.sphere(headR * scale, 18, 10, 0, Math.PI * 2, 0, Math.PI * Math.max(tl, 0.6)), 'head', hairM, [0, 0.012, -0.012], [rx, 0, 0], [0.97, 1.1, 1.05]);
  if (style === 'bald') return;
  if (style === 'swept') {
    cap(1.06, 0.5);
    rb.part(G.sphere(0.1, 12, 8), 'head', hairM, [0.012, 0.108, 0.062], [0.3, 0, 0.18], [1.3, 0.38, 0.85]);
    rb.part(G.sphere(0.09, 10, 8), 'head', hairM, [0, 0.07, -0.07], [0, 0, 0], [1.4, 0.8, 0.9]);
  } else if (style === 'short') {
    cap(1.05, 0.5);
    rb.part(G.sphere(0.08, 10, 8), 'head', hairM, [0, 0.1, 0.05], [0.2, 0, 0], [1.4, 0.4, 0.9]);
  } else if (style === 'tousled') {
    cap(1.06, 0.52);
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2, e = 0.35 + rand() * 0.9;
      const d = new V3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      if (d.z > 0.25 && d.y < 0.55) { d.y = 0.55 + rand() * 0.2; d.normalize(); }
      rb.part(G.sphere(0.038 + rand() * 0.02, 8, 6), 'head', hairM, [d.x * headR * 1.02, 0.02 + d.y * headR * 1.05, d.z * headR * 0.98], [rand(), rand(), rand()], [1.3, 0.8, 1]);
    }
  } else if (style === 'curly') {
    cap(1.04, 0.5);
    for (let i = 0; i < 54; i++) {
      const a = rand() * Math.PI * 2, e = 0.12 + Math.pow(rand(), 0.8) * 1.4;
      const d = new V3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      if (d.z > 0.75 && d.y < 0.35) continue;
      rb.part(G.sphere(0.03 + rand() * 0.012, 7, 5), 'head', hairM, [d.x * headR * 1.08, 0.025 + d.y * headR * 1.12, d.z * headR * 1.06 - 0.005]);
    }
  } else if (style === 'receding') {
    rb.part(G.sphere(headR * 1.05, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 'head', hairM, [0, 0.0, -0.02], [-0.55, 0, 0], [0.98, 1.08, 1.04]);
  } else if (style === 'long') {
    cap(1.07, 0.55);
    rb.part(G.capsule(0.11, 0.18, 4, 10), 'head', hairM, [0, -0.08, -0.07], [0.15, 0, 0], [1.25, 1, 0.6]);
  } else if (style === 'hood') {
    rb.part(G.sphere(headR * 1.25, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), 'head', hairM, [0, 0.0, -0.03], [-0.15, 0, 0], [1, 1.12, 1.1]);
  }
}

function addFace(rb, look, M_) {
  const headR = 0.14;
  const { skin, dark, white, iris, lip, brow } = M_;
  rb.part(G.sphere(headR, 20, 16), 'head', skin, [0, 0.01, 0.005], [0, 0, 0], [0.95, 1.08 * (look.domeHead || 1), 1.02]);
  const jaw = look.jaw || 1;
  rb.part(G.sphere(0.1, 14, 10), 'head', skin, [0, -0.058, 0.032], [0, 0, 0], [1.02 * jaw, 0.78, 0.98]);
  rb.part(G.capsule(0.022, 0.034, 3, 8), 'head', skin, [0, -0.004, 0.138], [1.05, 0, 0], [1, 1, 0.95]);
  rb.part(G.sphere(0.024, 10, 8), 'head', skin, [0, -0.024, 0.142], [0, 0, 0], [1.25, 0.8, 0.9]);
  for (const s of [-1, 1]) {
    rb.part(G.sphere(0.032, 10, 8), 'head', skin, [s * 0.135, 0.0, 0.0], [0, 0, 0], [0.45, 1, 0.75]);
    rb.part(G.sphere(0.034, 10, 8), 'head', skin, [s * 0.062, -0.032, 0.105], [0, 0, 0], [1.1, 0.8, 0.8]);
    if (!look.shades) {
      rb.part(G.sphere(0.024, 14, 10), 'eyes', white, [s * 0.047, 0, 0.02], [0, 0, 0], [1.15, 0.78, 0.62]);
      rb.part(G.sphere(0.0135, 12, 8), 'eyes', iris, [s * 0.047, -0.001, 0.031], [0, 0, 0], [1, 1, 0.55]);
      rb.part(G.sphere(0.0038, 6, 4), 'eyes', M('#ffffff', 0.2, 0, '#ffffff', 1.2), [s * 0.043, 0.005, 0.039]);
      rb.part(G.sphere(0.028, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), 'eyes', skin, [s * 0.047, 0.004, 0.018], [0.35, 0, 0], [1.12, 0.62, 0.72]);
      rb.part(G.box(0.056, 0.014, 0.016), 'head', brow, [s * 0.048, 0.06, 0.126], [0.15, s * -0.18, s * (look.worried ? 0.22 : -0.1)]);
    }
  }
  rb.part(G.torus(0.024, 0.0062, 5, 10, Math.PI), 'head', lip, [0, -0.056, 0.128], [0.2, 0, Math.PI]);
  if (look.shades) {
    for (const s of [-1, 1]) rb.part(G.box(0.07, 0.036, 0.014), 'head', M('#0a0a0e', 0.06, 0.9), [s * 0.046, 0.022, 0.146], [0, s * 0.18, 0]);
    rb.part(G.box(0.03, 0.008, 0.01), 'head', M('#101014', 0.2, 0.8), [0, 0.03, 0.15]);
    for (const s of [-1, 1]) rb.part(G.box(0.006, 0.008, 0.12), 'head', M('#101014', 0.2, 0.8), [s * 0.09, 0.028, 0.08]);
  }
  if (look.glasses) {
    const gm = M('#2a2a30', 0.3, 0.8);
    for (const s of [-1, 1]) {
      rb.part(G.torus(0.029, 0.0045, 6, 18), 'head', gm, [s * 0.047, 0.022, 0.149]);
      rb.part(G.box(0.005, 0.005, 0.12), 'head', gm, [s * 0.086, 0.024, 0.085]);
    }
    rb.part(G.box(0.03, 0.005, 0.005), 'head', gm, [0, 0.027, 0.151]);
  }
  if (look.beard === 'full') {
    const bm = M_.hair;
    rb.part(G.sphere(0.142, 16, 10, 0, Math.PI, Math.PI * 0.6, Math.PI * 0.4), 'head', bm, [0, -0.018, 0.016], [0, 0, 0], [1.02, 1.25, 1.12]);
    rb.part(G.capsule(0.016, 0.055, 3, 8), 'head', bm, [0, -0.038, 0.14], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) rb.part(G.box(0.03, 0.07, 0.05), 'head', bm, [s * 0.128, -0.02, 0.03], [0, s * 0.3, 0]);
  } else if (look.beard === 'stubble') {
    rb.part(G.sphere(0.141, 16, 10, 0, Math.PI, Math.PI * 0.55, Math.PI * 0.45), 'head', M_.stubble, [0, -0.01, 0.01], [0, 0, 0], [1.0, 1.1, 1.06]);
  }
}

// Build a complete humanoid. Returns the skinned mesh and metadata.
export function buildHumanoid(look, seed = 1) {
  const rand = mulberry32(seed);
  const rb = new RigBuilder();
  humanoidSkeleton(rb, look);
  const o = look.outfit;
  const bw = look.build || 1, mus = look.muscle || 1, bel = look.belly || 0;
  const skinC = col(look.skin);
  const mats = {
    skin: M(skinC, 0.62, 0),
    headSkin: M(skinC, look.hair === 'bald' ? 0.38 : 0.62, 0),
    hair: M(look.hairColor, 0.75, 0),
    stubble: M(col(look.hairColor).lerp(skinC, 0.55), 0.8, 0),
    dark: M('#1a1a1a', 0.5, 0), white: M('#f4f2ee', 0.35, 0), iris: M('#2b2f3a', 0.3, 0),
    lip: M(skinC.clone().multiply(new THREE.Color(0.85, 0.55, 0.52)), 0.6, 0), brow: M(look.hairColor, 0.8, 0),
    prim: M(o.primary, look.clothRough || 0.82, 0), sec: M(o.secondary, 0.82, 0), trim: M(o.trim, 0.35, 0.85),
    metal: M(o.metal, 0.32, 0.9), glow: M(o.glow, 0.3, 0, o.glow, 2.4), leather: M('#4a3222', 0.7, 0),
    boot: M(look.bootColor || '#2b221c', 0.65, 0.05),
  };
  const armor = look.pauldrons === 'plate' || look.armored;
  const torsoM = armor ? M(o.primary, 0.42, 0.6) : mats.prim;
  if (!look.noFace) {
    addFace(rb, look, { ...mats, skin: mats.headSkin });
    addHair(rb, look, mats.hair, 0.14, rand);
  }
  if (look.glowEyes) for (const s of [-1, 1]) rb.part(G.sphere(0.02, 8, 6), 'eyes', M('#fff6c0', 0.2, 0, '#ffe08a', 4), [s * 0.047, 0, 0.035]);
  // neck, torso
  rb.part(G.cyl(0.066 * Math.sqrt(bw), 0.075 * Math.sqrt(bw), 0.16, 10), 'neck', mats.skin, [0, 0.0, 0]);
  rb.part(G.lathe([[0.001, -0.15], [0.172, -0.14], [0.166, -0.05], [0.162, 0.05], [0.178, 0.15], [0.198, 0.27], [0.001, 0.28]], 18), 'spine', look.robe ? mats.prim : mats.sec, [0, 0, 0], [0, 0, 0], [bw * 1.15, 1, 0.8]);
  if (bel > 0.05) rb.part(G.sphere(0.155, 14, 10), 'spine', look.robe ? mats.prim : mats.prim, [0, 0.04, 0.03 + bel * 0.07], [0, 0, 0], [1.1 * bw, 0.95 + bel * 0.2, 0.75 + bel * 0.35]);
  const chestW = bw * 1.2 * (mus > 1.1 ? 1.08 : 1);
  rb.part(G.lathe([[0.001, -0.06], [0.19, -0.05], [0.225, 0.05], [0.245, 0.15], [0.232, 0.24], [0.15, 0.31], [0.001, 0.32]], 18), 'chest', torsoM, [0, 0, 0], [0, 0, 0], [chestW, 1, 0.82 + bel * 0.1]);
  if (mus > 1.2 && !armor) {
    for (const s of [-1, 1]) rb.part(G.sphere(0.1, 12, 8), 'chest', torsoM, [s * 0.09 * bw, 0.14, 0.1], [0, 0, 0], [1.1, 0.8, 0.55]);
  }
  // belt
  rb.part(G.torus(0.176, 0.026, 6, 22), 'spine', mats.leather, [0, -0.11, 0], [Math.PI / 2, 0, 0], [bw * 1.16, 0.76 + bel * 0.25, 1]);
  rb.part(G.box(0.07, 0.055, 0.03), 'spine', mats.trim, [0, -0.11, 0.145 + bel * 0.06]);
  // pelvis
  rb.part(G.sphere(0.18, 14, 10), 'hips', mats.sec, [0, -0.01, 0], [0, 0, 0], [1.2 * Math.pow(bw, 0.7), 0.74, 0.88]);
  // arms
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const sleeve = look.bareArms ? mats.skin : armor ? M(o.secondary, 0.5, 0.4) : mats.prim;
    rb.part(G.sphere(0.092 * mus, 12, 8), `shoulder${L}`, sleeve, [0, 0, 0]);
    rb.part(G.capsule(0.08 * mus, 0.18), `shoulder${L}`, sleeve, [0, -0.14, 0]);
    rb.part(G.capsule(0.07 * mus, 0.15), `elbow${L}`, look.gloves ? M(look.gloves, 0.6, 0.2) : look.bareArms ? mats.skin : sleeve, [0, -0.13, 0]);
    const handM = look.gloves ? M(look.gloves, 0.6, 0.2) : mats.skin;
    if (look.weapon === 'gauntlets') {
      rb.part(G.sphere(0.1, 14, 10), `hand${L}`, M('#3a2a20', 0.5, 0.6), [0, -0.07, 0.01], [0, 0, 0], [1.05, 1.1, 0.95]);
      rb.part(G.torus(0.06, 0.012, 6, 14), `hand${L}`, mats.glow, [0, -0.04, 0], [Math.PI / 2, 0, 0], [1.2, 1, 1]);
      rb.part(G.box(0.1, 0.02, 0.1), `hand${L}`, mats.glow, [0, -0.095, 0.02]);
    } else {
      rb.part(G.sphere(0.074, 12, 10), `hand${L}`, handM, [0, -0.05, 0.006], [0, 0, 0], [0.95, 1.15, 0.8]);
      rb.part(G.capsule(0.024, 0.045, 3, 6), `hand${L}`, handM, [s * 0.052, -0.028, 0.04], [0.6, 0, s * 0.6]);
    }
    if (look.bracers) rb.part(G.cyl(0.08 * mus, 0.075 * mus, 0.11, 12), `elbow${L}`, mats.metal, [0, -0.19, 0]);
    else if (!look.bareArms && !look.noFace) rb.part(G.torus(0.068 * mus, 0.016, 6, 14), `elbow${L}`, mats.trim, [0, -0.215, 0], [Math.PI / 2, 0, 0]);
    if (armor && !look.noFace) rb.part(G.sphere(0.07 * mus, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), `elbow${L}`, mats.metal, [0, 0.0, -0.03], [-1.6, 0, 0], [1, 1, 0.8]);
  }
  // legs
  const pants = look.robe === 'hoodie' || !look.robe ? mats.sec : M(o.secondary, 0.85, 0);
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    rb.part(G.capsule(0.108 * Math.sqrt(bw), 0.26), `thigh${L}`, pants, [0, -0.21, 0]);
    rb.part(G.capsule(0.086, 0.27), `knee${L}`, pants, [0, -0.21, 0]);
    const heavy = look.boots === 'heavy' || look.boots === 'tech';
    const footM = look.boots === 'sneaker' ? M('#f0f0f0', 0.6, 0) : look.boots === 'tech' ? M('#2a2e36', 0.4, 0.6) : mats.boot;
    rb.part(G.capsule(0.07, 0.14, 3, 10), `foot${L}`, footM, [0, -0.035, 0.055], [Math.PI / 2, 0, 0], [heavy ? 1.3 : 1.1, heavy ? 0.85 : 0.72, heavy ? 1.08 : 1]);
    if (heavy) rb.part(G.cyl(0.1, 0.092, 0.16, 12), `knee${L}`, look.boots === 'tech' ? mats.metal : mats.boot, [0, -0.36, 0]);
    if (look.boots === 'tech') rb.part(G.box(0.12, 0.012, 0.01), `knee${L}`, mats.glow, [0, -0.33, 0.075]);
    if (look.boots === 'sneaker') rb.part(G.box(0.1, 0.03, 0.2), `foot${L}`, M('#d8d8d8', 0.6, 0), [0, -0.075, 0.05]);
    if (armor && !look.noFace) rb.part(G.sphere(0.078, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), `knee${L}`, mats.metal, [0, 0.0, 0.035], [1.35, 0, 0], [1, 1, 0.75]);
  }
  // robe / coat skirts
  if (look.robe === 'robe') {
    rb.part(G.lathe([[0.19, 0.02], [0.22, -0.2], [0.28, -0.5], [0.35, -0.86]], 20), 'hips', mats.prim, [0, 0, 0], [0, 0, 0], [bw, 1, 0.9]);
    rb.part(G.torus(0.35, 0.02, 5, 24), 'hips', mats.trim, [0, -0.86, 0], [Math.PI / 2, 0, 0], [bw, 0.9, 1]);
    rb.part(G.box(0.12, 0.7, 0.02), 'hips', M(o.secondary, 0.8, 0), [0, -0.45, 0.26], [0.2, 0, 0]);
  } else if (look.robe === 'coat') {
    rb.part(G.lathe([[0.19, 0.05], [0.22, -0.15], [0.27, -0.35], [0.3, -0.56]], 20), 'hips', mats.prim, [0, 0, 0], [0, 0, 0], [bw, 1, 0.9]);
  } else if (look.robe === 'apron') {
    rb.part(G.box(0.34, 0.62, 0.03), 'hips', mats.leather, [0, -0.26, 0.17], [0.05, 0, 0]);
  } else if (look.robe === 'hoodie') {
    rb.part(G.torus(0.13, 0.05, 8, 16, Math.PI * 1.2), 'chest', mats.prim, [0, 0.3, -0.05], [Math.PI / 2 - 0.3, 0, Math.PI * 0.4]);
    rb.part(G.box(0.2, 0.08, 0.03), 'spine', mats.prim, [0, 0.02, 0.13], [0, 0, 0]);
  }
  // pauldrons
  const pd = look.pauldrons;
  for (const s of [1, -1]) {
    const pos = [s * 0.25 * bw, 0.255, 0];
    if (pd === 'plate' || pd === 'spiked') {
      rb.part(G.sphere(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 'chest', pd === 'spiked' ? mats.metal : M(o.metal, 0.3, 0.9), pos, [0, 0, -s * 0.35], [1.25 * Math.sqrt(bw), 0.8, 1.15]);
      rb.part(G.torus(0.16, 0.022, 6, 20), 'chest', mats.trim, [pos[0] + s * 0.012, pos[1] - 0.012, 0], [Math.PI / 2, -s * 0.35, 0], [1.25 * Math.sqrt(bw), 1.15, 1]);
      if (pd === 'spiked') {
        for (let k = 0; k < 3; k++) rb.part(G.cone(0.035, 0.16, 8), 'chest', mats.trim, [pos[0] + s * (0.02 + k * 0.04), pos[1] + 0.09, (k - 1) * 0.06], [0, 0, -s * (0.35 + k * 0.1)]);
      } else {
        rb.part(G.sphere(0.028, 10, 8), 'chest', mats.glow, [pos[0] + s * 0.05, pos[1] + 0.085, 0.02]);
      }
    } else if (pd === 'tech') {
      rb.part(G.box(0.18, 0.09, 0.21), 'chest', M(o.secondary, 0.35, 0.7), [pos[0] + s * 0.02, pos[1] + 0.03, 0], [0, 0, -s * 0.28]);
      rb.part(G.box(0.19, 0.014, 0.215), 'chest', mats.glow, [pos[0] + s * 0.03, pos[1] + 0.005, 0], [0, 0, -s * 0.28]);
    } else if (pd === 'cloth') {
      rb.part(G.sphere(0.105, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), 'chest', look.robe === 'hoodie' ? mats.prim : mats.trim, [pos[0], pos[1] - 0.01, 0], [0, 0, -s * 0.3], [1.15, 0.5, 1.1]);
    }
  }
  // chest details
  if (!look.noFace) rb.part(G.torus(0.105 * Math.sqrt(bw), 0.022, 6, 20), 'chest', look.robe === 'hoodie' ? mats.prim : mats.trim, [0, 0.295, 0.01], [Math.PI / 2 + 0.12, 0, 0], [1, 0.85, 1]);
  if (look.chestPlate) {
    rb.part(G.sphere(0.2, 16, 10, 0, Math.PI, 0, Math.PI), 'chest', M(look.chestPlate, 0.28, 0.9), [0, 0.13, 0.05], [0, 0, 0], [1.08 * bw, 0.92, 0.62]);
    rb.part(G.box(0.02, 0.2, 0.02), 'chest', mats.glow, [0, 0.12, 0.178]);
  }
  if (look.tabard) {
    const tm = M(look.tabard, 0.85, 0);
    rb.part(G.box(0.27 * bw, 0.5, 0.018), 'hips', tm, [0, -0.25, 0.175 + bel * 0.05], [0.06, 0, 0]);
    rb.part(G.box(0.29 * bw, 0.03, 0.022), 'hips', mats.trim, [0, -0.49, 0.19 + bel * 0.05], [0.06, 0, 0]);
    rb.part(G.box(0.27 * bw, 0.46, 0.018), 'hips', tm, [0, -0.23, -0.165], [-0.06, 0, 0]);
    rb.part(G.cyl(0.055, 0.055, 0.012, 18), 'hips', mats.trim, [0, -0.17, 0.187 + bel * 0.05], [Math.PI / 2 + 0.06, 0, 0]);
    rb.part(G.sphere(0.018, 8, 6), 'hips', M(o.glow, 0.3, 0, o.glow, 1.2), [0, -0.17, 0.196 + bel * 0.05]);
  }
  if (!look.noFace) for (const s of [-1, 1]) rb.part(G.box(0.07, 0.08, 0.05), 'spine', mats.leather, [s * 0.15 * bw, -0.13, 0.1 + bel * 0.04], [0, s * 0.5, 0]);
  if (look.techLines) {
    for (const s of [-1, 1]) rb.part(G.box(0.012, 0.2, 0.01), 'chest', mats.glow, [s * 0.07, 0.12, 0.162], [0, 0, s * 0.35]);
  }
  if (look.chain) rb.part(G.torus(0.105, 0.012, 6, 20), 'chest', M('#e8b84a', 0.25, 1), [0, 0.24, 0.07], [Math.PI / 2 - 0.5, 0, 0], [1.1, 1.2, 1]);
  if (look.emblem) rb.part(G.cyl(0.05, 0.05, 0.01, 16), 'chest', mats.glow, [0, 0.15, 0.165], [Math.PI / 2, 0, 0]);
  // cape
  if (look.cape) {
    const cm = M(look.cape, 0.85, 0);
    rb.part(G.box(0.46 * bw, 0.45, 0.02), 'capeA', cm, [0, -0.22, 0]);
    rb.part(G.box(0.5 * bw, 0.45, 0.02), 'capeB', cm, [0, -0.22, 0]);
    rb.part(G.box(0.54 * bw, 0.42, 0.02), 'capeC', cm, [0, -0.2, 0]);
    rb.part(G.box(0.55 * bw, 0.02, 0.025), 'capeC', mats.trim, [0, -0.41, 0]);
  }
  // hats & helmets
  if (look.hat === 'fedora') {
    const hm = M('#2c2a2e', 0.85, 0);
    rb.part(G.cyl(0.225, 0.225, 0.014, 26), 'head', hm, [0, 0.1, -0.006], [-0.08, 0, 0], [1, 1, 0.95]);
    rb.part(G.cyl(0.108, 0.13, 0.125, 20), 'head', hm, [0, 0.17, -0.012], [-0.08, 0, 0], [1, 1, 0.9]);
    rb.part(G.cyl(0.132, 0.132, 0.03, 20), 'head', M('#141316', 0.7, 0), [0, 0.123, -0.01], [-0.08, 0, 0], [1, 1, 0.9]);
    rb.part(G.sphere(0.06, 10, 6), 'head', hm, [0, 0.225, -0.005], [0, 0, 0], [1.6, 0.4, 1.2]);
  } else if (look.hat === 'straw') {
    const hm = M('#d9bb6a', 0.9, 0);
    rb.part(G.cyl(0.26, 0.26, 0.016, 24), 'head', hm, [0, 0.095, 0]);
    rb.part(G.cyl(0.11, 0.13, 0.11, 18), 'head', hm, [0, 0.15, 0]);
    rb.part(G.cyl(0.132, 0.132, 0.025, 18), 'head', M('#a33a2a', 0.8, 0), [0, 0.11, 0]);
  } else if (look.hat === 'helmet') {
    const hm = M(o.metal, 0.3, 0.9);
    rb.part(G.sphere(0.165, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), 'head', hm, [0, 0.01, -0.005], [0, 0, 0], [1, 1.1, 1.08]);
    rb.part(G.box(0.03, 0.14, 0.03), 'head', hm, [0, -0.02, 0.165]);
    rb.part(G.cone(0.04, 0.3, 8), 'head', M(look.plume || o.glow, 0.8, 0), [0, 0.24, -0.04], [-0.5, 0, 0], [1, 1, 2]);
    rb.part(G.torus(0.16, 0.014, 6, 20), 'head', mats.trim, [0, 0.0, 0], [Math.PI / 2, 0, 0], [1, 1.1, 1]);
  } else if (look.hat === 'goggles') {
    rb.part(G.torus(0.145, 0.014, 6, 20), 'head', mats.leather, [0, 0.07, 0], [Math.PI / 2 + 0.25, 0, 0], [1, 1.1, 1]);
    for (const s of [-1, 1]) rb.part(G.cyl(0.032, 0.032, 0.03, 12), 'head', M('#9fd8ff', 0.1, 0.6, '#3aa0ff', 0.6), [s * 0.05, 0.1, 0.12], [Math.PI / 2 - 0.9, 0, 0]);
  }
  // back gear
  if (look.back === 'jetpack') {
    const jm = M('#d8dde4', 0.3, 0.8);
    rb.part(G.box(0.26, 0.32, 0.12), 'chest', jm, [0, 0.14, -0.2]);
    for (const s of [-1, 1]) {
      rb.part(G.cyl(0.05, 0.06, 0.28, 12), 'chest', jm, [s * 0.09, 0.08, -0.27]);
      rb.part(G.torus(0.045, 0.012, 6, 14), 'chest', mats.glow, [s * 0.09, -0.07, -0.27], [Math.PI / 2, 0, 0]);
    }
    rb.part(G.box(0.2, 0.012, 0.01), 'chest', mats.glow, [0, 0.22, -0.262]);
  } else if (look.back === 'quiver') {
    rb.part(G.cyl(0.05, 0.05, 0.5, 10), 'chest', mats.leather, [0.08, 0.15, -0.18], [0, 0, 0.5]);
  }
  if (look.extra) look.extra(rb, mats, rand);
  addWeapon(rb, look, mats, rand);
  const mat = makeCharMaterial();
  mat.userData.u.uGlowColor.value.set(o.glow);
  const mesh = rb.build(mat);
  return { mesh, bones: rb.by, material: mat, height: 1.9 };
}

function addWeapon(rb, look, mats, rand) {
  const o = look.outfit;
  const wood = M('#5a3b24', 0.8, 0);
  const staff = (len = 1.75, r = 0.022, m = wood) => rb.part(G.cyl(r, r * 1.15, len, 8), 'handR', m, [0, -0.05 + len * 0.1, 0.02]);
  switch (look.weapon) {
    case 'launcher': {
      const body = M('#e7ebf0', 0.25, 0.85);
      rb.part(G.cyl(0.058, 0.058, 0.72, 14), 'handR', body, [0, -0.2, 0.06]);
      rb.part(G.cone(0.058, 0.16, 14), 'handR', body, [0, -0.64, 0.06], [Math.PI, 0, 0]);
      rb.part(G.torus(0.06, 0.012, 6, 16), 'handR', mats.glow, [0, 0.15, 0.06], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        rb.part(G.box(0.008, 0.14, 0.07), 'handR', M('#20242b', 0.4, 0.6), [Math.cos(a) * 0.06, 0.08, 0.06 + Math.sin(a) * 0.06], [0, a, 0]);
      }
      rb.part(G.box(0.05, 0.12, 0.05), 'handR', M('#20242b', 0.5, 0.5), [0, -0.04, 0.0]);
      break;
    }
    case 'orbstaff': {
      staff(1.8, 0.02, M('#cfd7e0', 0.25, 0.85));
      rb.part(G.sphere(0.1, 24, 16), 'handR', M('#e8eef5', 0.04, 1.0), [0, 1.02, 0.02]);
      rb.part(G.torus(0.14, 0.01, 6, 28), 'handR', mats.glow, [0, 1.02, 0.02], [Math.PI / 2 - 0.3, 0.2, 0]);
      rb.part(G.sphere(0.035, 12, 10), 'handR', M('#0b1016', 0.1, 0.2, '#8fe3ff', 3), [0, 1.02, 0.115]);
      break;
    }
    case 'hammer': {
      const dir = [-0.45, 0, 0];
      rb.part(G.cyl(0.024, 0.026, 0.75, 8), 'handR', wood, [0, 0.12, 0.16], dir);
      rb.part(G.box(0.3, 0.18, 0.18), 'handR', mats.metal, [0, 0.28, 0.46], dir);
      rb.part(G.box(0.32, 0.04, 0.2), 'handR', mats.trim, [0, 0.28, 0.46], dir);
      rb.part(G.sphere(0.035, 10, 8), 'handR', mats.glow, [0, 0.32, 0.54], dir);
      break;
    }
    case 'mace': {
      const dir = [-0.45, 0, 0];
      rb.part(G.cyl(0.022, 0.024, 0.6, 8), 'handR', M('#8a6a3a', 0.6, 0.3), [0, 0.08, 0.12], dir);
      rb.part(G.sphere(0.09, 12, 10), 'handR', mats.metal, [0, 0.2, 0.37], dir);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        rb.part(G.box(0.02, 0.13, 0.07), 'handR', mats.trim, [Math.cos(a) * 0.08, 0.2, 0.37 + Math.sin(a) * 0.08], [dir[0], a, 0]);
      }
      rb.part(G.sphere(0.04, 10, 8), 'handR', mats.glow, [0, 0.27, 0.46], dir);
      break;
    }
    case 'eyestaff': {
      const pts = [];
      for (let i = 0; i < 7; i++) pts.push(new V3(Math.sin(i * 1.3) * 0.02, -0.75 + i * 0.29, 0.02 + Math.cos(i * 1.1) * 0.02));
      rb.part(taperedTube(pts, pts.map((_, i) => 0.03 - i * 0.002), 7), 'handR', M('#3b2a3f', 0.8, 0));
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        rb.part(G.cone(0.02, 0.2, 6), 'handR', M('#3b2a3f', 0.8, 0), [Math.cos(a) * 0.06, 1.05, 0.02 + Math.sin(a) * 0.06], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]);
      }
      rb.part(G.sphere(0.075, 18, 14), 'handR', M('#f2eefa', 0.2, 0, '#d0b0ff', 0.5), [0, 1.08, 0.02]);
      rb.part(G.sphere(0.038, 14, 10), 'handR', M('#2a0a4a', 0.2, 0, '#b46bff', 3), [0, 1.08, 0.075]);
      rb.part(G.sphere(0.017, 10, 8), 'handR', M('#050008', 0.2, 0), [0, 1.08, 0.105]);
      break;
    }
    case 'lantern': {
      staff(1.8, 0.022);
      rb.part(G.torus(0.08, 0.01, 6, 16, Math.PI), 'handR', M('#b89a4a', 0.3, 0.9), [0, 1.05, 0.02], [0, 0, 0]);
      rb.part(G.box(0.12, 0.16, 0.12), 'handR', M('#b89a4a', 0.3, 0.9), [0, 0.92, 0.02]);
      rb.part(G.box(0.1, 0.13, 0.1), 'handR', M('#fff3c0', 0.2, 0, '#b8ffd8', 3.5), [0, 0.92, 0.02]);
      rb.part(G.cone(0.09, 0.08, 4), 'handR', M('#b89a4a', 0.3, 0.9), [0, 1.03, 0.02], [0, Math.PI / 4, 0]);
      break;
    }
    case 'cubestaff': {
      staff(1.75, 0.02, M('#2e3440', 0.4, 0.6));
      const cm = M('#bff8ff', 0.2, 0, '#8affff', 3);
      const s = 0.1;
      for (const [x, y, z, rx, rz] of [[0, s, s, 0, Math.PI / 2], [0, -s, s, 0, Math.PI / 2], [0, s, -s, 0, Math.PI / 2], [0, -s, -s, 0, Math.PI / 2],
        [s, 0, s, 0, 0], [-s, 0, s, 0, 0], [s, 0, -s, 0, 0], [-s, 0, -s, 0, 0],
        [s, s, 0, Math.PI / 2, 0], [-s, s, 0, Math.PI / 2, 0], [s, -s, 0, Math.PI / 2, 0], [-s, -s, 0, Math.PI / 2, 0]]) {
        rb.part(G.box(0.012, 0.2 + 0.012, 0.012), 'handR', cm, [x, 1.1 + y, 0.02 + z], [rx, 0, rz]);
      }
      rb.part(G.box(0.07, 0.07, 0.07), 'handR', M('#1a4a6a', 0.2, 0.3, '#3ad8ff', 1.5), [0, 1.1, 0.02], [0.6, 0.6, 0]);
      break;
    }
    case 'halberd': {
      rb.part(G.cyl(0.024, 0.026, 2.3, 8), 'handR', wood, [0, 0.35, 0.02]);
      rb.part(G.box(0.02, 0.32, 0.22), 'handR', mats.metal, [0, 1.3, 0.1]);
      rb.part(G.cone(0.04, 0.3, 6), 'handR', mats.metal, [0, 1.6, 0.02]);
      break;
    }
    case 'book': {
      rb.part(G.box(0.18, 0.24, 0.05), 'handL', M('#5a2a2a', 0.7, 0), [0.02, -0.08, 0.06], [0, 0, 0]);
      rb.part(G.box(0.17, 0.22, 0.052), 'handL', M('#efe3c0', 0.9, 0), [0.03, -0.08, 0.06]);
      break;
    }
    case 'pitchfork': {
      staff(1.7, 0.02);
      for (let k = -1; k <= 1; k++) rb.part(G.cyl(0.008, 0.008, 0.25, 6), 'handR', mats.metal, [k * 0.05, 1.02, 0.02]);
      rb.part(G.box(0.12, 0.015, 0.015), 'handR', mats.metal, [0, 0.9, 0.02]);
      break;
    }
    default: break;
  }
  if (look.offhand === 'shield') {
    const sh = new THREE.Shape();
    const w = 0.24, h = 0.36, r = 0.06;
    sh.moveTo(-w + r, -h); sh.lineTo(w - r, -h); sh.quadraticCurveTo(w, -h, w, -h + r); sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h);
    sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, -h + r); sh.quadraticCurveTo(-w, -h, -w + r, -h);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 });
    rb.part(g, 'handL', M(look.outfit.primary, 0.4, 0.6), [0.07, -0.05, 0.0], [0, Math.PI / 2, 0]);
    rb.part(G.box(0.03, 0.62, 0.02), 'handL', mats.trim, [0.13, -0.05, 0.0]);
    rb.part(G.box(0.03, 0.02, 0.4), 'handL', mats.trim, [0.13, 0.05, 0.0]);
    rb.part(G.sphere(0.05, 12, 8), 'handL', mats.glow, [0.14, 0.05, 0]);
  } else if (look.offhand === 'scrollshield') {
    rb.part(G.cyl(0.28, 0.28, 0.05, 28), 'handL', M('#e8e2d2', 0.4, 0.5), [0.08, -0.05, 0.0], [0, 0, Math.PI / 2]);
    rb.part(G.torus(0.28, 0.02, 6, 28), 'handL', mats.trim, [0.1, -0.05, 0], [0, Math.PI / 2, 0]);
    rb.part(G.cyl(0.035, 0.035, 0.3, 12), 'handL', M('#f3e6c4', 0.8, 0), [0.12, -0.05, 0], [Math.PI / 2, 0, 0]);
    rb.part(G.sphere(0.045, 10, 8), 'handL', M('#c26a3d', 0.6, 0.2, '#ff9a60', 0.6), [0.125, -0.05, 0.17]);
    rb.part(G.sphere(0.045, 10, 8), 'handL', M('#c26a3d', 0.6, 0.2, '#ff9a60', 0.6), [0.125, -0.05, -0.17]);
  }
}

// ------------------------------------------------------------------ NPC presets
const OUT = (primary, secondary, trim, metal, glow) => ({ primary, secondary, trim, metal, glow });
export const NPC_LOOKS = {
  smith: { skin: '#d9a582', hair: 'bald', hairColor: '#6b3a1f', beard: 'full', build: 1.3, muscle: 1.3, bareArms: true, robe: 'apron', weapon: 'hammer', outfit: OUT('#5a3a24', '#3a2a20', '#ffb347', '#8a8a8a', '#ff8a3a'), boots: 'heavy' },
  pilot: { skin: '#c78c6a', hair: 'short', hairColor: '#1a1a1a', build: 1.0, hat: 'goggles', outfit: OUT('#e0661c', '#2a2e36', '#e8eef5', '#c8d0da', '#ffb060'), boots: 'tech', techLines: true },
  scholar: { skin: '#eac2a4', hair: 'receding', hairColor: '#c8c8c8', beard: 'full', build: 0.95, robe: 'robe', weapon: 'book', outfit: OUT('#1f4f86', '#e9eef5', '#e8d58a', '#dfe6ee', '#9fdcff'), boots: 'cloth' },
  ranger: { skin: '#b98262', hair: 'short', hairColor: '#4a3020', build: 1.0, cape: '#2f5a3a', outfit: OUT('#4a6a3a', '#3a2e22', '#c8b27a', '#9aa4ae', '#9fe8ff'), back: 'quiver', boots: 'heavy', weapon: 'lantern' },
  oracle: { skin: '#e6d2c0', hair: 'hood', hairColor: '#f2eee6', build: 0.95, robe: 'robe', outfit: OUT('#f2eee6', '#c8a85a', '#ffe08a', '#f5f0e6', '#fff0b0'), weapon: 'orbstaff', boots: 'cloth', glowEyes: true },
  farmer: { skin: '#d7a07e', hair: 'short', hairColor: '#8a5a3a', beard: 'stubble', build: 1.1, belly: 0.3, hat: 'straw', outfit: OUT('#4a6a9a', '#6a5a3a', '#d0b070', '#9a9a9a', '#ffd070'), weapon: 'pitchfork', boots: 'heavy' },
  guard_eacc: { skin: '#d9a582', hair: 'short', hairColor: '#2a1d14', build: 1.25, muscle: 1.2, armored: true, pauldrons: 'spiked', hat: 'helmet', plume: '#ff6a1a', cape: '#b3471a', tabard: '#c8541e', weapon: 'halberd', offhand: null, bracers: true, outfit: OUT('#3a3a40', '#2a2226', '#ffb347', '#a8a8b0', '#ff8a3a'), boots: 'heavy', gloves: '#3a3a40' },
  guard_ea: { skin: '#e8c2a4', hair: 'short', hairColor: '#2a1d14', build: 1.25, muscle: 1.2, armored: true, pauldrons: 'plate', hat: 'helmet', plume: '#4fb3ff', cape: '#1f5aa0', tabard: '#2c6cc0', weapon: 'halberd', bracers: true, outfit: OUT('#dfe6ee', '#2a3a5a', '#e8d58a', '#e4ebf2', '#9fdcff'), boots: 'heavy', gloves: '#9aa6b4' },
};

export function enrichChampionLook(champ) {
  const l = { ...champ.look, outfit: { ...champ.look.outfit } };
  if (champ.id === 'elon') { l.techLines = true; l.gloves = '#20242b'; l.chestPlate = '#b9c3cf'; l.outfit.secondary = '#3a404c'; }
  if (champ.id === 'beff') { l.bareArms = true; l.gloves = null; l.outfit.secondary = '#3a2416'; }
  if (champ.id === 'eliezer') { l.worried = true; }
  if (champ.id === 'marc') { l.emblem = true; l.bracers = true; l.gloves = '#c9ced6'; l.armored = true; l.tabard = '#c8962f'; }
  if (champ.id === 'dario') { l.armored = true; l.bracers = true; l.gloves = '#dfe4ea'; l.tabard = '#c26a3d'; }
  if (champ.id === 'bostrom') { l.gloves = '#2e3440'; l.outfit.primary = '#5a667e'; l.outfit.secondary = '#2a3140'; }
  if (champ.id === 'sam') { l.outfit.secondary = '#3a4658'; }
  if (champ.id === 'will') { l.gloves = '#e8efe8'; }
  return l;
}

// ------------------------------------------------------------------ animation
const ARM_POSES = {
  launcher: { shoulderR: [-0.35, 0, -0.1], elbowR: [-1.25, 0, 0] },
  gauntlets: { shoulderR: [-0.3, 0, -0.25], elbowR: [-1.35, 0.3, 0], shoulderL: [-0.3, 0, 0.25], elbowL: [-1.35, -0.3, 0] },
  staff: { shoulderR: [-0.1, 0, -0.12], elbowR: [-0.55, 0, 0] },
  melee: { shoulderR: [-0.1, 0, -0.15], elbowR: [-0.5, 0, 0] },
  shield: { shoulderL: [-0.35, 0, 0.2], elbowL: [-1.1, -0.4, 0] },
  book: { shoulderL: [-0.3, 0, 0.1], elbowL: [-1.3, -0.3, 0] },
};
const STAFFS = new Set(['orbstaff', 'eyestaff', 'lantern', 'cubestaff', 'halberd', 'pitchfork']);
const MELEE = new Set(['hammer', 'mace', 'gauntlets', 'melee-stamp']);

export class HumanoidAnimator {
  constructor(bones, look) {
    this.b = bones;
    this.look = look;
    this.phase = 0;
    this.t = Math.random() * 10;
    this.blinkT = 2 + Math.random() * 3;
    this.targets = {};
    this.names = Object.keys(bones);
    this.rest = {};
    for (const n of this.names) this.rest[n] = bones[n].position.clone();
    this.base = {};
    const w = look.weapon;
    const pose = w === 'launcher' ? ARM_POSES.launcher : w === 'gauntlets' ? ARM_POSES.gauntlets : STAFFS.has(w) ? ARM_POSES.staff : MELEE.has(w) ? ARM_POSES.melee : {};
    Object.assign(this.base, pose);
    if (look.offhand) Object.assign(this.base, ARM_POSES.shield);
    if (w === 'book') Object.assign(this.base, ARM_POSES.book);
    this.melee = MELEE.has(w);
    this.deadT = 0;
    this.hover = !!look.hover;
  }

  update(dt, s) {
    const b = this.b;
    this.t += dt;
    const t = this.t;
    const T = {};
    const set = (n, x = 0, y = 0, z = 0) => { T[n] = [x, y, z]; };
    const add = (n, x = 0, y = 0, z = 0) => { const v = T[n] || [0, 0, 0]; T[n] = [v[0] + x, v[1] + y, v[2] + z]; };
    for (const n of this.names) set(n);
    for (const k in this.base) set(k, ...this.base[k]);
    let hipsY = 0, rootY = 0;
    const speed = s.speed || 0;
    const run = Math.min(1.25, speed / 7);
    const dirS = s.back ? -1 : 1;
    if (s.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 2.2);
      const k = this.deadT;
      set('hips', -1.45 * k, 0, 0.1 * k);
      hipsY = -0.72 * k;
      set('shoulderL', -0.4, 0, 1.2 * k); set('shoulderR', -0.4, 0, -1.2 * k);
      set('thighL', 0.1, 0, 0.15); set('thighR', -0.2, 0, -0.1); set('kneeL', 0.3); set('kneeR', 0.5);
      set('neck', -0.2 * k, 0.4 * k, 0);
    } else {
      this.deadT = 0;
      if (s.swim) {
        this.phase += dt * 3.2;
        const p = this.phase;
        set('hips', 1.25, 0, 0);
        set('neck', -0.9, 0, 0);
        set('shoulderL', -2.6 + Math.sin(p) * 0.8, 0, 0.6 + Math.cos(p) * 0.5);
        set('shoulderR', -2.6 + Math.sin(p) * 0.8, 0, -0.6 - Math.cos(p) * 0.5);
        set('elbowL', -0.6); set('elbowR', -0.6);
        set('thighL', Math.sin(p * 2) * 0.4); set('thighR', -Math.sin(p * 2) * 0.4);
        set('kneeL', 0.3); set('kneeR', 0.3);
        hipsY = -0.75;
      } else if (s.air) {
        set('thighL', -0.7, 0, 0.05); set('thighR', -0.2, 0, -0.05);
        set('kneeL', 1.1); set('kneeR', 0.6);
        add('shoulderL', -0.4, 0, 0.5); add('shoulderR', -0.4, 0, -0.5);
        set('spine', 0.1);
      } else if (s.sit) {
        hipsY = -0.52;
        set('thighL', -1.5, 0.15, 0); set('thighR', -1.5, -0.15, 0);
        set('kneeL', 1.45); set('kneeR', 1.45);
        set('shoulderL', -0.5, 0, 0.1); set('shoulderR', -0.5, 0, -0.1);
        set('elbowL', -0.7); set('elbowR', -0.7);
        set('spine', 0.15 + Math.sin(t * 1.4) * 0.02);
      } else if (speed > 0.3) {
        this.phase += dt * speed * 2.85 * dirS;
        const p = this.phase;
        const sw = Math.sin(p);
        set('thighL', -sw * 0.8 * run, 0, 0.02); set('thighR', sw * 0.8 * run, 0, -0.02);
        set('kneeL', (Math.max(0, Math.sin(p + 1.6)) * 1.25 + 0.12) * run);
        set('kneeR', (Math.max(0, Math.sin(p + 1.6 + Math.PI)) * 1.25 + 0.12) * run);
        set('footL', Math.cos(p) * 0.25 * run); set('footR', -Math.cos(p) * 0.25 * run);
        const arm = run * 0.65;
        if (!this.base.shoulderL) add('shoulderL', sw * arm, 0, 0.1); else add('shoulderL', sw * arm * 0.3);
        if (!this.base.shoulderR) add('shoulderR', -sw * arm, 0, -0.1); else add('shoulderR', -sw * arm * 0.3);
        if (!this.base.elbowL) add('elbowL', -0.35 - 0.55 * run);
        if (!this.base.elbowR) add('elbowR', -0.35 - 0.55 * run);
        set('spine', 0.13 * run * dirS, sw * 0.12 * run, 0);
        set('chest', 0.03, sw * 0.1 * run, 0);
        add('hips', 0, -sw * 0.1 * run, 0);
        if (s.strafe) add('hips', 0, s.strafe * 0.7, 0);
        hipsY = Math.abs(Math.cos(p)) * 0.06 * run - 0.035 * run;
      } else {
        const br = Math.sin(t * 1.6);
        set('chest', 0.015 * br, 0, 0);
        set('neck', -0.02 * br, Math.sin(t * 0.37) * 0.15, 0);
        if (!this.base.shoulderL) set('shoulderL', 0.02 * br, 0, 0.12);
        if (!this.base.shoulderR) set('shoulderR', 0.02 * br, 0, -0.12);
        if (!this.base.elbowL) set('elbowL', -0.18);
        if (!this.base.elbowR) set('elbowR', -0.18);
        set('thighL', 0, 0.05, 0.04); set('thighR', 0, -0.05, -0.04);
        hipsY = br * 0.006;
      }
      // emotes
      if (s.emote === 'dance' && speed < 0.3) {
        const d = t * 7;
        hipsY = Math.abs(Math.sin(d)) * 0.08 - 0.04;
        set('hips', 0, Math.sin(d * 0.5) * 0.35, Math.sin(d) * 0.12);
        set('shoulderL', -2.4 + Math.sin(d) * 0.6, 0, 0.5); set('shoulderR', -0.4 - Math.sin(d) * 0.6, 0, -0.5);
        set('elbowL', -0.6 - Math.cos(d) * 0.4); set('elbowR', -1.2);
        set('thighL', -0.3 * Math.max(0, Math.sin(d))); set('kneeL', 0.6 * Math.max(0, Math.sin(d)));
        set('thighR', -0.3 * Math.max(0, -Math.sin(d))); set('kneeR', 0.6 * Math.max(0, -Math.sin(d)));
        set('neck', 0, 0, Math.sin(d) * 0.2);
      } else if (s.emote === 'wave' && speed < 0.3) {
        set('shoulderR', -0.2, 0, -2.5); set('elbowR', 0, 0, -0.4 - Math.sin(t * 9) * 0.45);
      } else if (s.emote === 'cheer' && speed < 0.3) {
        hipsY = Math.abs(Math.sin(t * 6)) * 0.12;
        set('shoulderL', 0, 0, 2.6 + Math.sin(t * 12) * 0.2); set('shoulderR', 0, 0, -2.6 - Math.sin(t * 12) * 0.2);
        set('elbowL', -0.2); set('elbowR', -0.2);
      }
      // upper body actions
      if (s.cast > 0.01) {
        const c = s.cast;
        const osc = Math.sin(t * 8) * 0.08;
        const lerpSet = (n, x, y, z) => { const v = T[n]; T[n] = [v[0] + (x - v[0]) * c, v[1] + (y - v[1]) * c, v[2] + (z - v[2]) * c]; };
        if (s.channel) {
          lerpSet('shoulderR', -1.55, 0, 0.1); lerpSet('elbowR', -0.05, 0, 0);
          lerpSet('shoulderL', -1.45, 0, -0.1); lerpSet('elbowL', -0.1, 0, 0);
        } else {
          lerpSet('shoulderL', -1.25 + osc, 0, -0.25); lerpSet('shoulderR', -1.25 - osc, 0, 0.25);
          lerpSet('elbowL', -0.7, 0, 0); lerpSet('elbowR', -0.7, 0, 0);
        }
        add('chest', -0.06 * c);
      }
      if (s.attackT !== undefined && s.attackT < 0.5) {
        const a = s.attackT / 0.5;
        if (this.melee || s.meleeSwing) {
          let sx, sz, tw;
          if (a < 0.35) { const k = a / 0.35; sx = -0.4 - 2.0 * k; sz = -0.3 * k; tw = 0.4 * k; }
          else if (a < 0.6) { const k = (a - 0.35) / 0.25; sx = -2.4 + 2.3 * k; sz = -0.3 + 0.3 * k; tw = 0.4 - 0.8 * k; }
          else { const k = (a - 0.6) / 0.4; sx = -0.1 * (1 - k) + (T.shoulderR[0]) * k; sz = 0; tw = -0.4 * (1 - k); }
          T.shoulderR = [sx, 0, sz];
          T.elbowR = [-0.3, 0, 0];
          add('chest', 0.05, tw, 0);
          if (this.look.weapon === 'gauntlets' && s.attackAlt) {
            T.shoulderL = [sx, 0, -sz]; T.shoulderR = [-0.3, 0, -0.25];
          }
        } else {
          const k = a < 0.3 ? a / 0.3 : 1 - (a - 0.3) / 0.7;
          T.shoulderR = [T.shoulderR[0] + (-1.55 - T.shoulderR[0]) * k, 0, T.shoulderR[2] * (1 - k)];
          T.elbowR = [T.elbowR[0] * (1 - k), 0, 0];
        }
      }
      if (s.hitT !== undefined && s.hitT < 0.3) {
        const k = 1 - s.hitT / 0.3;
        add('chest', -0.22 * k); add('neck', -0.2 * k);
      }
      if (s.stun) {
        add('neck', 0.3, Math.sin(t * 5) * 0.3, Math.sin(t * 3) * 0.2);
        add('spine', 0.2);
      }
    }
    // cape
    if (b.capeA) {
      const flutter = Math.sin(t * 7) * 0.04 * (0.3 + run);
      set('capeA', 0.12 + run * 0.55 + (s.air ? 0.4 : 0) + flutter, 0, 0);
      set('capeB', -0.05 + run * 0.25 + Math.sin(t * 7 + 1) * 0.06 * run, 0, 0);
      set('capeC', run * 0.25 + Math.sin(t * 7 + 2) * 0.08 * (0.3 + run), 0, 0);
      if (s.dead) { set('capeA', -0.2); set('capeB', 0); set('capeC', 0); }
    }
    // blink
    this.blinkT -= dt;
    if (b.eyes) {
      const blink = this.blinkT < 0.12 && this.blinkT > 0 ? 0.1 : 1;
      if (this.blinkT <= 0) this.blinkT = 2.5 + Math.random() * 4;
      b.eyes.scale.y = blink;
    }
    // apply with smoothing
    const k = 1 - Math.exp(-dt * (s.dead ? 8 : 16));
    for (const n of this.names) {
      const bone = b[n];
      const tg = T[n];
      bone.rotation.x += (tg[0] - bone.rotation.x) * k;
      bone.rotation.y += (tg[1] - bone.rotation.y) * k;
      bone.rotation.z += (tg[2] - bone.rotation.z) * k;
    }
    const hy = this.rest.hips.y + hipsY;
    b.hips.position.y += (hy - b.hips.position.y) * (1 - Math.exp(-dt * 14));
    b.root.position.y = this.hover ? 0.25 + Math.sin(t * 1.5) * 0.08 : rootY;
  }
}

// ------------------------------------------------------------------ template cache (shared geometry, per-instance skeleton)
const TEMPLATES = new Map();
export function cachedBuild(key, buildFn) {
  let t = TEMPLATES.get(key);
  if (!t) {
    const b = buildFn();
    const sk = b.mesh.skeleton;
    t = {
      geometry: b.mesh.geometry, restRoot: sk.bones[0].clone(true), inverses: sk.boneInverses.map((m) => m.clone()),
      bindMatrix: b.mesh.bindMatrix.clone(), names: sk.bones.map((x) => x.name), glow: b.material.userData.u.uGlowColor.value.clone(),
      bs: b.mesh.boundingSphere.clone(), extra: b.extra,
    };
    TEMPLATES.set(key, t);
  }
  const root = t.restRoot.clone(true);
  const by = {};
  root.traverse((o) => { if (o.isBone) by[o.name] = o; });
  const bones = t.names.map((n) => by[n]);
  const mat = makeCharMaterial();
  mat.userData.u.uGlowColor.value.copy(t.glow);
  const mesh = new THREE.SkinnedMesh(t.geometry, mat);
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones, t.inverses.map((m) => m.clone())), t.bindMatrix);
  mesh.boundingSphere = t.bs.clone();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, bones: by, material: mat, shared: true, extra: t.extra };
}

// ------------------------------------------------------------------ Character model wrapper
export class CharacterModel {
  constructor(look, opts = {}) {
    const built = opts.cacheKey ? cachedBuild(opts.cacheKey, () => buildHumanoid(look, opts.seed || 1)) : buildHumanoid(look, opts.seed || 1);
    this.shared = !!built.shared;
    this.look = look;
    this.mesh = built.mesh;
    this.bones = built.bones;
    this.material = built.material;
    this.u = built.material.userData.u;
    this.object = new THREE.Group();
    this.object.add(this.mesh);
    const scale = (look.height || 1) * (opts.scale || 1);
    this.object.scale.setScalar(scale);
    this.scale = scale;
    this.height = 1.95 * scale;
    this.animator = new HumanoidAnimator(this.bones, look);
    this.flashT = 0;
    this._v = new V3();
  }
  update(dt, state) {
    this.animator.update(dt, state);
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const f = this.flashT / 0.18;
      this.u.uFlash.value.setRGB(f * 0.6, f * 0.45, f * 0.4);
    }
  }
  flash() { this.flashT = 0.18; }
  setGlow(v) { this.u.uGlow.value = v; }
  setFade(v) { this.u.uFade.value = v; }
  worldOf(boneName, out = new V3()) {
    const b = this.bones[boneName];
    if (!b) return out.copy(this.object.position).add(new V3(0, this.height * 0.6, 0));
    return b.getWorldPosition(out);
  }
  dispose() { if (!this.shared) this.mesh.geometry.dispose(); this.material.dispose(); }
}
