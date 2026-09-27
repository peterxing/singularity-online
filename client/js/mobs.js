import * as THREE from 'three';
import { mulberry32 } from '../shared/rng.js';
import { RigBuilder, M, G, makeCharMaterial, CharacterModel, NPC_LOOKS, cachedBuild } from './characters.js';
import { taperedTube } from './foliage.js';

const V3 = THREE.Vector3;

class BaseModel {
  constructor(mesh, bones, material, height) {
    this.mesh = mesh;
    this.bones = bones;
    this.material = material;
    this.u = material.userData.u;
    this.object = new THREE.Group();
    this.object.add(mesh);
    this.height = height;
    this.t = Math.random() * 10;
    this.flashT = 0;
    this.deadK = 0;
  }
  flash() { this.flashT = 0.18; }
  setGlow(v) { this.u.uGlow.value = v; }
  setFade(v) { this.u.uFade.value = v; }
  worldOf(name, out = new V3()) {
    const b = this.bones[name];
    if (b) return b.getWorldPosition(out);
    return out.copy(this.object.position).add(new V3(0, this.height * 0.6, 0));
  }
  _flash(dt) {
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const f = this.flashT / 0.18;
      this.u.uFlash.value.setRGB(f * 0.7, f * 0.5, f * 0.45);
    }
  }
  _dead(dt, s) { this.deadK = s.dead ? Math.min(1, this.deadK + dt * 2) : 0; return this.deadK; }
  dispose() { if (!this.shared) this.mesh.geometry.dispose(); this.material.dispose(); }
}

// ------------------------------------------------------------------ Paperclip drone
function paperclipCurve() {
  const pts = [];
  const arc = (cx, cy, r, a0, a1, n = 10) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push(new V3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0)); } };
  pts.push(new V3(0.18, -0.35, 0));
  arc(0, 0.35, 0.18, 0, Math.PI);
  arc(-0.03, -0.5, 0.15, Math.PI, Math.PI * 2);
  arc(0.02, 0.25, 0.1, 0, Math.PI);
  pts.push(new V3(-0.08, -0.22, 0));
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
}

function buildPaperclip() {
    const rb = new RigBuilder();
    rb.bone('root', null, 0, 0, 0);
    rb.bone('body', 'root', 0, 1.6, 0);
    rb.ready();
    const wire = M('#d9e0ea', 0.18, 1.0);
    rb.part(new THREE.TubeGeometry(paperclipCurve(), 140, 0.032, 8, false), 'body', wire, [0, 0, 0], [0, 0, 0], [1.5, 1.5, 1.5]);
    rb.part(G.sphere(0.13, 16, 12), 'body', M('#1a1d24', 0.3, 0.8), [0, -0.05, 0]);
    rb.part(G.sphere(0.075, 14, 10), 'body', M('#ff4d2a', 0.2, 0, '#ff5a2a', 4), [0, -0.05, 0.1]);
    rb.part(G.torus(0.2, 0.012, 6, 24), 'body', M('#ff8a4a', 0.3, 0, '#ff6a2a', 2), [0, -0.05, 0], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) {
      rb.part(G.cyl(0.012, 0.012, 0.3, 6), 'body', wire, [s * 0.3, -0.05, 0], [0, 0, Math.PI / 2]);
      rb.part(G.torus(0.07, 0.01, 4, 12), 'body', M('#9fe8ff', 0.3, 0, '#6fd8ff', 1.8), [s * 0.45, -0.05, 0], [Math.PI / 2, 0, 0]);
    }
    const mat = makeCharMaterial();
    return { mesh: rb.build(mat), bones: rb.by, material: mat, h: 2.2 };
}

export class PaperclipModel extends BaseModel {
  constructor() { const b = cachedBuild('m:paperclip', buildPaperclip); super(b.mesh, b.bones, b.material, 2.2); this.shared = true; }
  update(dt, s) {
    this.t += dt;
    const b = this.bones.body;
    const k = this._dead(dt, s);
    b.position.y = 1.6 + Math.sin(this.t * 2.2) * 0.12 - k * 1.35;
    b.rotation.y += dt * (s.dead ? 0 : s.combat ? 3 : 0.8);
    b.rotation.z = k * 1.5 + Math.sin(this.t * 1.3) * 0.08;
    b.rotation.x = s.attackT !== undefined && s.attackT < 0.4 ? Math.sin((s.attackT / 0.4) * Math.PI) * 0.8 : Math.sin(this.t) * 0.05;
    this._flash(dt);
  }
}

// ------------------------------------------------------------------ Hype wraith
function buildWraith() {
    const rb = new RigBuilder();
    rb.bone('root', null, 0, 0, 0);
    rb.bone('body', 'root', 0, 1.1, 0);
    rb.bone('head', 'body', 0, 0.75, 0.02);
    rb.bone('armL', 'body', 0.32, 0.55, 0);
    rb.bone('armR', 'body', -0.32, 0.55, 0);
    rb.bone('tail1', 'body', 0, -0.2, 0);
    rb.bone('tail2', 'tail1', 0, -0.35, -0.05);
    rb.ready();
    const robe = M('#3a1f5a', 0.7, 0, '#9a5aff', 0.6, 0.9);
    const dark = M('#140a22', 0.8, 0, '#6a3aff', 0.3, 0.6);
    rb.part(G.lathe([[0.001, 0.72], [0.22, 0.66], [0.32, 0.45], [0.3, 0.2], [0.26, 0.0], [0.001, -0.02]], 18), 'body', robe);
    rb.part(G.lathe([[0.25, 0.0], [0.22, -0.2], [0.14, -0.36], [0.001, -0.42]], 16), 'tail1', robe);
    rb.part(G.lathe([[0.14, 0.0], [0.09, -0.2], [0.001, -0.45]], 12), 'tail2', dark);
    rb.part(G.sphere(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.7), 'head', robe, [0, 0.02, -0.02], [0, 0, 0], [1, 1.25, 1.1]);
    rb.part(G.sphere(0.15, 14, 10), 'head', M('#05020a', 0.9, 0), [0, -0.02, 0.05], [0, 0, 0], [1, 1.1, 0.8]);
    for (const s of [-1, 1]) rb.part(G.sphere(0.03, 10, 8), 'head', M('#ffffff', 0.2, 0, '#e0a0ff', 6), [s * 0.06, 0.0, 0.16], [0, 0, 0], [1, 0.6, 1]);
    for (const [bn, s] of [['armL', 1], ['armR', -1]]) {
      const pts = [new V3(0, 0, 0), new V3(s * 0.1, -0.2, 0.05), new V3(s * 0.15, -0.45, 0.12), new V3(s * 0.12, -0.62, 0.2)];
      rb.part(taperedTube(pts, [0.09, 0.07, 0.05, 0.015], 8), bn, robe);
      rb.part(G.sphere(0.04, 8, 6), bn, M('#d9b8ff', 0.2, 0, '#c07aff', 3), [s * 0.12, -0.64, 0.21]);
    }
    const mat = makeCharMaterial();
    return { mesh: rb.build(mat), bones: rb.by, material: mat, h: 2.2 };
}

export class WraithModel extends BaseModel {
  constructor() { const b = cachedBuild('m:wraith', buildWraith); super(b.mesh, b.bones, b.material, 2.2); this.shared = true; }
  update(dt, s) {
    this.t += dt;
    const b = this.bones, t = this.t;
    const k = this._dead(dt, s);
    b.body.position.y = 1.1 + Math.sin(t * 1.8) * 0.12 - k * 0.8;
    b.body.rotation.x = k * 1.2 + (s.speed > 0.3 ? 0.25 : 0);
    b.tail1.rotation.x = 0.2 + Math.sin(t * 3) * 0.2 + (s.speed > 0.3 ? 0.4 : 0);
    b.tail2.rotation.x = 0.3 + Math.sin(t * 3 + 1) * 0.3;
    b.tail1.rotation.z = Math.sin(t * 2.2) * 0.15;
    const cast = s.attackT !== undefined && s.attackT < 0.6 ? Math.sin((s.attackT / 0.6) * Math.PI) : 0;
    b.armL.rotation.x = -0.3 - cast * 1.2 + Math.sin(t * 2) * 0.1;
    b.armR.rotation.x = -0.3 - cast * 1.2 + Math.sin(t * 2 + 1) * 0.1;
    b.armL.rotation.z = 0.2 + Math.sin(t * 1.5) * 0.1;
    b.armR.rotation.z = -0.2 - Math.sin(t * 1.5) * 0.1;
    b.head.rotation.y = Math.sin(t * 0.7) * 0.3;
    this._flash(dt);
  }
}

// ------------------------------------------------------------------ Shoggoth spawn
function buildShoggoth(seed = 3) {
    const rand = mulberry32(seed);
    const rb = new RigBuilder();
    rb.bone('root', null, 0, 0, 0);
    rb.bone('body', 'root', 0, 0.95, 0);
    const T = 7;
    for (let i = 0; i < T; i++) {
      const a = (i / T) * Math.PI * 2 + 0.3;
      rb.bone(`t${i}a`, 'body', Math.cos(a) * 0.75, -0.35, Math.sin(a) * 0.75);
      rb.bone(`t${i}b`, `t${i}a`, 0, -0.35, 0);
      rb.bone(`t${i}c`, `t${i}b`, 0, -0.3, 0);
    }
    rb.ready();
    const flesh = M('#0e1a14', 0.3, 0.25, '#2aff8a', 0.08, 0.35);
    const g = new THREE.IcosahedronGeometry(1, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new V3(p.getX(i), p.getY(i), p.getZ(i));
      const n = Math.sin(v.x * 4.1 + 1) * Math.sin(v.y * 3.7 + 2) * Math.sin(v.z * 4.3) * 0.18 + Math.sin(v.x * 9 + v.z * 7) * 0.04;
      v.multiplyScalar(1 + n);
      if (v.y < -0.4) v.y = -0.4 + (v.y + 0.4) * 0.3;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    rb.part(g, 'body', flesh, [0, 0, 0], [0, 0, 0], [0.95, 0.85, 0.95]);
    const white = M('#f2f0e8', 0.25, 0), pupil = M('#0a0a0a', 0.2, 0, '#1a0000', 1);
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2, e = -0.1 + rand() * 1.1;
      const d = new V3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      if (d.z > 0.7 && d.y < 0.5 && d.y > -0.1) continue;
      const r = 0.05 + rand() * 0.07;
      const pos = d.clone().multiplyScalar(0.9);
      pos.y *= 0.85;
      rb.part(G.sphere(r, 10, 8), 'body', white, [pos.x, pos.y, pos.z]);
      const pp = d.clone().multiplyScalar(0.9 + r * 0.8); pp.y *= 0.85;
      rb.part(G.sphere(r * 0.5, 8, 6), 'body', pupil, [pp.x, pp.y, pp.z]);
    }
    // smiley mask
    const mask = M('#ffd83a', 0.5, 0, '#ffb000', 0.25);
    rb.part(G.cyl(0.36, 0.36, 0.05, 28), 'body', mask, [0, 0.12, 0.92], [Math.PI / 2 - 0.1, 0, 0]);
    for (const s of [-1, 1]) rb.part(G.sphere(0.05, 10, 8), 'body', M('#1a1208', 0.5, 0), [s * 0.12, 0.23, 0.955], [0, 0, 0], [0.8, 1.3, 0.5]);
    rb.part(G.torus(0.19, 0.026, 6, 18, Math.PI), 'body', M('#1a1208', 0.5, 0), [0, 0.1, 0.955], [0, 0, Math.PI]);
    for (const s of [-1, 1]) rb.part(G.box(0.08, 0.04, 0.02), 'body', M('#2a1a10', 0.6, 0), [s * 0.39, 0.12, 0.88], [0, s * 0.5, 0]);
    for (let i = 0; i < T; i++) {
      rb.part(G.capsule(0.12, 0.3, 3, 8), `t${i}a`, flesh, [0, -0.17, 0]);
      rb.part(G.capsule(0.085, 0.28, 3, 8), `t${i}b`, flesh, [0, -0.16, 0]);
      rb.part(G.cone(0.07, 0.36, 8), `t${i}c`, flesh, [0, -0.16, 0], [Math.PI, 0, 0]);
    }
    const mat = makeCharMaterial();
    return { mesh: rb.build(mat), bones: rb.by, material: mat, h: 2.0 };
}

export class ShoggothModel extends BaseModel {
  constructor() { const b = cachedBuild('m:shoggoth', () => buildShoggoth(3)); super(b.mesh, b.bones, b.material, 2.0); this.shared = true; this.T = 7; }
  update(dt, s) {
    this.t += dt;
    const b = this.bones, t = this.t;
    const k = this._dead(dt, s);
    const hop = s.speed > 0.3 ? Math.abs(Math.sin(t * 7)) : 0;
    b.body.position.y = 0.95 + hop * 0.18 - k * 0.55;
    const pulse = 1 + Math.sin(t * 2.5) * 0.04;
    b.body.scale.set(pulse * (1 + k * 0.3), (1 / pulse) * (1 - k * 0.45) * (1 - hop * 0.08), pulse * (1 + k * 0.3));
    const atk = s.attackT !== undefined && s.attackT < 0.5 ? Math.sin((s.attackT / 0.5) * Math.PI) : 0;
    b.body.rotation.x = atk * 0.35;
    for (let i = 0; i < this.T; i++) {
      const ph = t * 3 + i * 1.7;
      const a = (i / this.T) * Math.PI * 2 + 0.3;
      const out = 0.5 + Math.sin(ph) * 0.25 + k * 0.6;
      b[`t${i}a`].rotation.set(Math.sin(a) * out, 0, -Math.cos(a) * out);
      b[`t${i}b`].rotation.set(Math.sin(ph + 1) * 0.5, 0, Math.cos(ph + 1) * 0.4);
      b[`t${i}c`].rotation.set(Math.sin(ph + 2) * 0.7, 0, Math.cos(ph + 2) * 0.5);
    }
    this._flash(dt);
  }
}

// ------------------------------------------------------------------ Roko's basilisk
function buildBasilisk() {
    const rb = new RigBuilder();
    const N = 16;
    rb.bone('root', null, 0, 0, 0);
    rb.bone('s0', 'root', 0, 0.9, 1.2);
    for (let i = 1; i < N; i++) rb.bone(`s${i}`, `s${i - 1}`, 0, 0, -0.62);
    rb.bone('head', 's0', 0, 0.1, 0.55);
    rb.bone('jaw', 'head', 0, -0.12, 0.05);
    rb.ready();
    const scale = M('#1f5a2a', 0.35, 0.35, '#3aff6a', 0.2, 0.5);
    const belly = M('#c8b060', 0.6, 0.1);
    const spike = M('#d8c070', 0.4, 0.5);
    for (let i = 0; i < N; i++) {
      const r = 0.5 * (1 - i / N) + 0.12;
      rb.part(G.sphere(r, 14, 10), `s${i}`, scale, [0, 0, -0.3], [0, 0, 0], [1, 0.85, 1.35]);
      rb.part(G.sphere(r * 0.8, 12, 8), `s${i}`, belly, [0, -r * 0.35, -0.3], [0, 0, 0], [0.95, 0.6, 1.3]);
      if (i < N - 2) rb.part(G.cone(r * 0.25, r * 0.9, 6), `s${i}`, spike, [0, r * 0.85, -0.3], [-0.5, 0, 0]);
    }
    rb.part(G.sphere(0.5, 18, 14), 'head', scale, [0, 0.05, 0.1], [0, 0, 0], [1, 0.72, 1.45]);
    rb.part(G.box(0.55, 0.14, 0.55), 'jaw', belly, [0, 0, 0.35]);
    for (let k = 0; k < 5; k++) {
      rb.part(G.cone(0.035, 0.14, 6), 'jaw', M('#f8f4e8', 0.3, 0), [-0.2 + k * 0.1, 0.12, 0.58], [0, 0, 0]);
      rb.part(G.cone(0.035, 0.14, 6), 'head', M('#f8f4e8', 0.3, 0), [-0.2 + k * 0.1, -0.12, 0.62], [Math.PI, 0, 0]);
    }
    for (const s of [-1, 1]) {
      rb.part(G.sphere(0.09, 12, 10), 'head', M('#ffe24a', 0.1, 0, '#ff3a1a', 5), [s * 0.28, 0.16, 0.45], [0, 0, 0], [1, 0.7, 1]);
      rb.part(G.sphere(0.04, 8, 6), 'head', M('#000000', 0.1, 0), [s * 0.31, 0.16, 0.52], [0, 0, 0], [0.4, 1.2, 0.5]);
    }
    for (let k = 0; k < 7; k++) rb.part(G.cone(0.05, 0.5 - Math.abs(k - 3) * 0.06, 6), 'head', spike, [(k - 3) * 0.1, 0.38, -0.25], [-1.0 - Math.abs(k - 3) * 0.1, 0, (k - 3) * 0.1]);
    const mat = makeCharMaterial();
    return { mesh: rb.build(mat), bones: rb.by, material: mat, h: 3.6 };
}

export class BasiliskModel extends BaseModel {
  constructor() { const b = cachedBuild('m:basilisk', buildBasilisk); super(b.mesh, b.bones, b.material, 3.6); this.shared = true; this.N = 16; }
  update(dt, s) {
    this.t += dt;
    const b = this.bones, t = this.t;
    const k = this._dead(dt, s);
    const moving = s.speed > 0.3;
    const freq = moving ? 6 : 1.8;
    const amp = moving ? 0.28 : 0.12;
    for (let i = 0; i < this.N; i++) {
      const seg = b[`s${i}`];
      seg.rotation.y = Math.sin(t * freq - i * 0.7) * amp * (1 - k);
      seg.rotation.x = i < 4 ? (i === 0 ? -0.9 : 0.3) * (1 - k) : 0;
    }
    b.s0.position.y = 0.9 + (1 - k) * 0.9;
    const atk = s.attackT !== undefined && s.attackT < 0.6 ? Math.sin((s.attackT / 0.6) * Math.PI) : 0;
    b.head.rotation.x = 0.9 * (1 - k) - atk * 0.6 + Math.sin(t * 1.3) * 0.05;
    b.head.position.z = 0.55 + atk * 0.5;
    b.jaw.rotation.x = atk * 0.6 + Math.max(0, Math.sin(t * 0.8)) * 0.1;
    this._flash(dt);
  }
}

// ------------------------------------------------------------------ humanoid-rig monsters
function hornExtra(rb, mats) {
  const horn = M('#2a1a12', 0.5, 0.2);
  for (const s of [-1, 1]) {
    rb.part(G.cone(0.035, 0.16, 8), 'head', horn, [s * 0.08, 0.13, 0.02], [0.3, 0, -s * 0.5]);
    rb.part(G.cone(0.04, 0.14, 6), 'head', mats.skin, [s * 0.15, 0.03, -0.01], [0, 0, -s * 1.3], [0.6, 1, 1]);
  }
  const pts = [new V3(0, 0, -0.1), new V3(0, -0.08, -0.3), new V3(0, 0.05, -0.5), new V3(0, 0.12, -0.58)];
  rb.part(taperedTube(pts, [0.025, 0.02, 0.015, 0.005], 6), 'hips', mats.skin);
  rb.part(G.cone(0.05, 0.1, 4), 'hips', mats.skin, [0, 0.16, -0.6], [-0.6, 0, 0]);
  rb.part(G.box(0.22, 0.22, 0.02), 'chest', M('#f5f5f5', 0.8, 0), [0, 0.13, 0.17]);
  rb.part(G.box(0.03, 0.14, 0.022), 'chest', M('#111111', 0.8, 0), [0, 0.13, 0.172]);
  rb.part(G.box(0.04, 0.03, 0.022), 'chest', M('#111111', 0.8, 0), [-0.015, 0.19, 0.172], [0, 0, 0.6]);
}

function golemExtra(rb) {
  const paper = M('#e8e0cc', 0.9, 0), paper2 = M('#d6ccb2', 0.9, 0), tape = M('#c8201a', 0.5, 0, '#ff2a1a', 0.15);
  for (let i = 0; i < 5; i++) rb.part(G.box(0.62 - (i % 2) * 0.05, 0.1, 0.42 + (i % 2) * 0.04), 'chest', i % 2 ? paper : paper2, [((i * 37) % 5 - 2) * 0.01, -0.02 + i * 0.1, 0], [0, (i - 2) * 0.05, 0]);
  rb.part(G.box(0.66, 0.05, 0.46), 'chest', tape, [0, 0.2, 0]);
  rb.part(G.box(0.05, 0.54, 0.47), 'chest', tape, [0.1, 0.18, 0]);
  for (let i = 0; i < 3; i++) rb.part(G.box(0.46, 0.09, 0.34), 'spine', i % 2 ? paper : paper2, [0, -0.1 + i * 0.09, 0], [0, i * 0.08, 0]);
  rb.part(G.box(0.3, 0.26, 0.28), 'head', paper, [0, 0.03, 0]);
  rb.part(G.box(0.32, 0.04, 0.3), 'head', tape, [0, 0.1, 0]);
  for (const s of [-1, 1]) rb.part(G.box(0.06, 0.03, 0.02), 'head', M('#ff3a1a', 0.2, 0, '#ff2a0a', 5), [s * 0.07, 0.02, 0.145]);
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    rb.part(G.box(0.2, 0.3, 0.2), `shoulder${L}`, paper2, [s * 0.04, -0.12, 0]);
    rb.part(G.box(0.18, 0.28, 0.18), `elbow${L}`, paper, [0, -0.12, 0]);
    rb.part(G.box(0.21, 0.035, 0.21), `elbow${L}`, tape, [0, -0.05, 0]);
    rb.part(G.box(0.22, 0.32, 0.22), `thigh${L}`, paper, [0, -0.2, 0]);
    rb.part(G.box(0.2, 0.34, 0.2), `knee${L}`, paper2, [0, -0.2, 0]);
    rb.part(G.box(0.24, 0.1, 0.32), `foot${L}`, paper, [0, -0.02, 0.04]);
  }
  rb.part(G.cyl(0.2, 0.2, 0.14, 18), 'handR', M('#7a1a14', 0.6, 0), [0, -0.12, 0]);
  rb.part(G.cyl(0.21, 0.21, 0.03, 18), 'handR', M('#ff3a2a', 0.4, 0, '#ff2a1a', 0.8), [0, -0.2, 0]);
  rb.part(G.cyl(0.04, 0.05, 0.16, 8), 'handR', M('#5a3a24', 0.8, 0), [0, 0.02, 0]);
  rb.part(G.box(0.2, 0.24, 0.2), 'handL', paper, [0, -0.08, 0]);
}

function molochExtra(rb, mats) {
  const bronze = M('#5a3a22', 0.38, 0.85), dark = M('#1c120c', 0.6, 0.4);
  const ember = M('#ff7a1a', 0.3, 0, '#ff5a0a', 5);
  rb.part(G.sphere(0.2, 18, 14), 'head', bronze, [0, 0.02, 0.02], [0, 0, 0], [1.05, 1.0, 1.15]);
  rb.part(G.box(0.2, 0.14, 0.16), 'head', bronze, [0, -0.07, 0.18]);
  for (const s of [-1, 1]) {
    rb.part(G.sphere(0.022, 8, 6), 'head', dark, [s * 0.05, -0.08, 0.26]);
    rb.part(G.sphere(0.035, 10, 8), 'head', ember, [s * 0.09, 0.06, 0.18], [0, 0, 0], [1.2, 0.7, 0.8]);
    const pts = [new V3(s * 0.15, 0.1, 0), new V3(s * 0.32, 0.16, 0.02), new V3(s * 0.45, 0.32, 0.06), new V3(s * 0.48, 0.52, 0.12)];
    rb.part(taperedTube(pts, [0.06, 0.05, 0.03, 0.006], 8), 'head', M('#e8dcc0', 0.4, 0.1));
    rb.part(G.cone(0.05, 0.14, 8), 'head', bronze, [s * 0.19, 0.04, -0.02], [0, 0, -s * 1.4], [0.6, 1, 1]);
  }
  rb.part(G.torus(0.05, 0.012, 6, 14), 'head', M('#e8b84a', 0.25, 1), [0, -0.12, 0.25]);
  rb.part(G.cyl(0.16, 0.16, 0.05, 24), 'chest', dark, [0, 0.12, 0.17], [Math.PI / 2, 0, 0]);
  rb.part(G.cyl(0.13, 0.13, 0.03, 24), 'chest', ember, [0, 0.12, 0.19], [Math.PI / 2, 0, 0]);
  for (let k = -2; k <= 2; k++) rb.part(G.box(0.02, 0.26, 0.03), 'chest', dark, [k * 0.05, 0.12, 0.215]);
  rb.part(G.torus(0.17, 0.02, 6, 24), 'chest', M('#e8b84a', 0.3, 1), [0, 0.12, 0.2]);
  rb.part(G.box(0.4, 0.34, 0.04), 'hips', dark, [0, -0.25, 0.14], [0.1, 0, 0]);
  for (let i = 0; i < 8; i++) rb.part(G.torus(0.035, 0.01, 5, 10), 'chest', M('#6a6a6a', 0.4, 0.9), [-0.12 + i * 0.035, 0.28 - i * 0.03, 0.14 + (i % 2) * 0.01], [0, i % 2 ? Math.PI / 2 : 0, 0.8]);
}

export function buildMobHumanoid(kind) {
  if (kind === 'imp') {
    return new CharacterModel({
      skin: '#c8342a', hair: 'bald', hairColor: '#2a0a0a', build: 0.9, muscle: 0.9, belly: 0.25, jaw: 1.1, bareArms: true, hat: 'goggles',
      outfit: { primary: '#2a2a2a', secondary: '#1a1a1a', trim: '#ffcc33', metal: '#999999', glow: '#ff6a1a' }, boots: 'cloth', extra: hornExtra,
    }, { scale: 0.74, seed: 5, cacheKey: 'h:imp' });
  }
  if (kind === 'golem') {
    return new CharacterModel({
      skin: '#e0d8c4', hair: 'bald', hairColor: '#000', build: 1.5, muscle: 1.5, noFace: true, bareArms: true,
      outfit: { primary: '#e8e0cc', secondary: '#d6ccb2', trim: '#c8201a', metal: '#999', glow: '#ff2a1a' }, extra: golemExtra, weapon: 'melee-stamp',
    }, { scale: 1.35, seed: 6, cacheKey: 'h:golem' });
  }
  if (kind === 'moloch') {
    const m = new CharacterModel({
      skin: '#6a4428', hair: 'bald', hairColor: '#000', build: 1.55, muscle: 1.6, belly: 0.35, noFace: true, bareArms: true, armored: true, pauldrons: 'spiked',
      outfit: { primary: '#3a2616', secondary: '#24160e', trim: '#e8b84a', metal: '#6a4a2a', glow: '#ff5a0a' }, weapon: 'gauntlets', cape: '#3a0e08', extra: molochExtra, boots: 'heavy',
    }, { scale: 3.3, seed: 9, cacheKey: 'h:moloch' });
    m.setGlow(0.2);
    m.u.uGlowColor.value.set('#ff5a0a');
    return m;
  }
  if (kind === 'guard_eacc' || kind === 'guard_ea') return new CharacterModel(NPC_LOOKS[kind], { scale: 1.12, seed: 4, cacheKey: 'h:' + kind });
  return null;
}

// ------------------------------------------------------------------ summons & nodes
function buildTurret() {
    const rb = new RigBuilder();
    rb.bone('root', null, 0, 0, 0);
    rb.bone('head', 'root', 0, 1.0, 0);
    rb.ready();
    const metal = M('#c9ced6', 0.3, 0.9), dark = M('#2a2e36', 0.5, 0.6), glow = M('#ffb347', 0.3, 0, '#ff9a2a', 3);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      rb.part(G.cyl(0.04, 0.05, 1.1, 6), 'root', dark, [Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]);
    }
    rb.part(G.cyl(0.25, 0.3, 0.2, 14), 'root', metal, [0, 0.9, 0]);
    rb.part(G.box(0.4, 0.3, 0.45), 'head', metal, [0, 0.1, 0]);
    rb.part(G.cyl(0.06, 0.07, 0.7, 12), 'head', dark, [0, 0.1, 0.5], [Math.PI / 2, 0, 0]);
    rb.part(G.torus(0.07, 0.015, 6, 14), 'head', glow, [0, 0.1, 0.86]);
    rb.part(G.sphere(0.05, 10, 8), 'head', glow, [0, 0.3, 0.1]);
    const mat = makeCharMaterial();
    return { mesh: rb.build(mat), bones: rb.by, material: mat, h: 1.5 };
}

export class TurretModel extends BaseModel {
  constructor() { const b = cachedBuild('m:turret', buildTurret); super(b.mesh, b.bones, b.material, 1.5); this.shared = true; }
  update(dt, s) { this.t += dt; this.bones.head.rotation.y = s.aimYaw || 0; this._flash(dt); }
}

function buildCluster() {
    const rb = new RigBuilder();
    rb.bone('root', null, 0, 0, 0);
    rb.bone('ring', 'root', 0, 1.1, 0);
    rb.ready();
    const rack = M('#1a1e26', 0.4, 0.6);
    rb.part(G.box(0.7, 1.6, 0.6), 'root', rack, [0, 0.8, 0]);
    for (let i = 0; i < 7; i++) {
      rb.part(G.box(0.62, 0.03, 0.02), 'root', M('#39ffb0', 0.3, 0, '#39ffb0', 2.5 - (i % 3) * 0.6), [0, 0.25 + i * 0.2, 0.305]);
      rb.part(G.box(0.02, 0.03, 0.52), 'root', M('#3a8aff', 0.3, 0, '#3a8aff', 2), [0.355, 0.25 + i * 0.2, 0]);
    }
    rb.part(G.torus(0.75, 0.03, 6, 36), 'ring', M('#6de0ff', 0.2, 0, '#6de0ff', 3), [0, 0, 0], [Math.PI / 2, 0, 0]);
    const mat = makeCharMaterial();
    return { mesh: rb.build(mat), bones: rb.by, material: mat, h: 1.8 };
}

export class ClusterModel extends BaseModel {
  constructor() { const b = cachedBuild('m:cluster', buildCluster); super(b.mesh, b.bones, b.material, 1.8); this.shared = true; }
  update(dt) { this.t += dt; this.bones.ring.rotation.z += dt * 1.5; this.bones.ring.position.y = 1.1 + Math.sin(this.t * 2) * 0.2; this._flash(dt); }
}

function buildSheaf() {
    const rb = new RigBuilder();
    rb.bone('root', null, 0, 0, 0);
    rb.bone('body', 'root', 0, 0, 0);
    rb.ready();
    const rand = mulberry32(12);
    const stalk = M('#e8c25a', 0.6, 0, '#ffcf4a', 0.35), ear = M('#f5d470', 0.5, 0, '#ffd24a', 0.9);
    for (let i = 0; i < 22; i++) {
      const a = rand() * Math.PI * 2, r = rand() * 0.18;
      const tilt = 0.05 + r * 0.9;
      rb.part(G.cyl(0.012, 0.014, 1.2, 5), 'body', stalk, [Math.cos(a) * r, 0.6, Math.sin(a) * r], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]);
      rb.part(G.capsule(0.03, 0.12, 2, 6), 'body', ear, [Math.cos(a) * (r + tilt * 0.55), 1.22, Math.sin(a) * (r + tilt * 0.55)], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]);
    }
    rb.part(G.torus(0.12, 0.03, 6, 16), 'body', M('#8a5a2a', 0.8, 0), [0, 0.55, 0], [Math.PI / 2, 0, 0]);
    const mat = makeCharMaterial();
    return { mesh: rb.build(mat), bones: rb.by, material: mat, h: 1.4 };
}

export class SheafModel extends BaseModel {
  constructor() { const b = cachedBuild('m:sheaf', buildSheaf); super(b.mesh, b.bones, b.material, 1.4); this.shared = true; }
  update(dt, s) { this.t += dt; this.bones.body.rotation.z = Math.sin(this.t * 1.5) * 0.05; this.setGlow(0.3 + Math.sin(this.t * 3) * 0.2); this._flash(dt); }
}

export function createMobModel(type) {
  switch (MOB_MODEL[type] || type) {
    case 'paperclip': return new PaperclipModel();
    case 'wraith': return new WraithModel();
    case 'shoggoth': return new ShoggothModel();
    case 'basilisk': return new BasiliskModel();
    case 'turret': return new TurretModel();
    case 'cluster': return new ClusterModel();
    case 'sheaf': return new SheafModel();
    default: return buildMobHumanoid(type);
  }
}

const MOB_MODEL = { paperclip: 'paperclip', wraith: 'wraith', imp: 'imp', golem: 'golem', shoggoth: 'shoggoth', basilisk: 'basilisk', moloch: 'moloch', guard_eacc: 'guard_eacc', guard_ea: 'guard_ea' };
