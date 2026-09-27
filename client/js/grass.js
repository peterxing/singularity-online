import * as THREE from 'three';
import { NOISE_GLSL, GRASS_TINT_GLSL, TERRAIN_HEIGHT_GLSL, THREE_CHUNKS } from './glsl.js';
import { GRASS_COLORS } from './terrainView.js';
import { mulberry32 } from '../shared/rng.js';

function bladeGeometry(segs) {
  const pos = [], idx = [];
  for (let s = 0; s < segs; s++) {
    const y = s / segs;
    pos.push(-0.5, y, 0, 0.5, y, 0);
  }
  pos.push(0, 1, 0);
  for (let s = 0; s < segs - 1; s++) {
    const a = s * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const last = (segs - 1) * 2, tip = segs * 2;
  idx.push(last, last + 1, tip);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

function flowerGeometry() {
  const pos = [], part = [], idx = [];
  const add = (x, y, z, p) => { pos.push(x, y, z); part.push(p); return pos.length / 3 - 1; };
  // stem (two crossed quads)
  for (const [dx, dz] of [[1, 0], [0, 1]]) {
    const a = add(-0.012 * dx, 0, -0.012 * dz, 0), b = add(0.012 * dx, 0, 0.012 * dz, 0);
    const c = add(-0.01 * dx, 1, -0.01 * dz, 0), d = add(0.01 * dx, 1, 0.01 * dz, 0);
    idx.push(a, b, c, b, d, c);
  }
  // petals: fan around the head
  const center = add(0, 1.02, 0, 2);
  const P = 6;
  const ring = [];
  for (let i = 0; i < P * 2; i++) {
    const a = (i / (P * 2)) * Math.PI * 2;
    const r = i % 2 ? 0.05 : 0.11;
    ring.push(add(Math.cos(a) * r, 1.0 + (i % 2 ? 0.015 : -0.01), Math.sin(a) * r, 1));
  }
  for (let i = 0; i < ring.length; i++) idx.push(center, ring[i], ring[(i + 1) % ring.length]);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

export class Grass {
  constructor(gfx, tex) {
    this.gfx = gfx;
    this.tex = tex;
    this.shared = {
      uTime: { value: 0 },
      uHeightTex: { value: tex.height }, uWorld: { value: tex.world }, uRes: { value: tex.res },
      uGrassMap: { value: tex.grass },
      uPush: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uWheatA: { value: new THREE.Color(0xe0b24a) }, uWheatB: { value: new THREE.Color(0xc98f2e) },
      ...GRASS_COLORS,
    };
    this.layers = [];
    this.build(gfx.q);
  }

  _material(layerUniforms, flower = false) {
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const shared = this.shared;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, layerUniforms);
      const head = `#include <common>
uniform float uTime; uniform vec2 uCam; uniform float uPatch; uniform vec4 uRange;
uniform float uWidth; uniform float uWiden; uniform float uFar; uniform float uHScale;
uniform sampler2D uGrassMap; uniform vec4 uPush[6];
uniform vec3 uWheatA; uniform vec3 uWheatB;
attribute vec2 aOffset; attribute vec4 aRand;
${flower ? 'attribute float aPart;' : ''}
varying vec3 vGColor;
${NOISE_GLSL}
${GRASS_TINT_GLSL}
${TERRAIN_HEIGHT_GLSL}
`;
      const grassBody = `
vec2 g_rel = mod(aOffset - uCam + 0.5 * uPatch, uPatch) - 0.5 * uPatch;
vec2 g_wp = uCam + g_rel;
float g_dist = length(g_rel);
vec2 g_uv = ((g_wp - uWorld.xy) / uWorld.w + 0.5) / uRes;
vec4 g_gm = texture2D(uGrassMap, g_uv);
float g_dens = g_gm.r;
float g_wheat = g_gm.g;
float g_t = smoothstep(uRange.x, uRange.y, g_dist);
float g_keep = step(aRand.w, g_dens) * (uFar > 0.5 ? step(aRand.z, g_t) : step(g_t, aRand.z));
float g_fo = 1.0 - smoothstep(uRange.z, uRange.w, g_dist);
g_keep *= step(0.001, g_fo);
float g_bh = mix(0.3, 0.7, aRand.x) * (0.55 + 0.6 * g_dens) * uHScale;
g_bh = mix(g_bh, mix(0.95, 1.3, aRand.x), g_wheat);
g_bh *= g_keep * mix(0.4, 1.0, g_fo);
float g_bw = uWidth * mix(0.75, 1.3, aRand.y) * (1.0 + g_dist * uWiden) * mix(1.0, 0.85, g_wheat);
float g_tt = position.y;
float g_ear = g_wheat * smoothstep(0.6, 0.78, g_tt) * (1.0 - smoothstep(0.93, 1.0, g_tt)) * 1.6;
float g_w = g_bw * ((1.0 - g_tt * 0.88) + g_ear);
float g_ang = fract(aRand.z * 7.31 + aRand.x * 3.1) * 6.2831853;
vec2 g_dir = vec2(cos(g_ang), sin(g_ang));
vec2 g_side = vec2(-g_dir.y, g_dir.x);
float g_lean = mix(0.12, 0.42, fract(aRand.y * 5.3)) * g_bh;
float g_gust = vnoise(g_wp * 0.03 + vec2(uTime * 0.21, uTime * 0.09));
float g_wave = sin(uTime * 1.9 + dot(g_wp, vec2(0.21, 0.13)) + aRand.x * 2.0);
vec2 g_wdir = normalize(vec2(1.0, 0.35));
float g_wind = (0.16 + g_gust * 0.85) * (0.65 + 0.35 * g_wave) * mix(1.0, 1.35, g_wheat);
vec2 g_push = vec2(0.0); float g_squash = 0.0;
for (int i = 0; i < 6; i++) {
  vec2 d = g_wp - uPush[i].xz;
  float r = uPush[i].w;
  float l = length(d);
  float f = r > 0.0 ? (1.0 - smoothstep(r * 0.25, r, l)) : 0.0;
  g_push += d / max(l, 0.001) * f;
  g_squash = max(g_squash, f);
}
vec2 g_bend = g_dir * g_lean + g_wdir * g_wind * g_bh * 0.6 + g_push * g_bh * 1.1;
float g_bl = length(g_bend);
float g_t2 = g_tt * g_tt;
vec3 g_pos = vec3(g_wp.x, terrainH(g_wp), g_wp.y);
g_pos.xz += g_side * position.x * g_w + g_bend * g_t2;
g_pos.y += g_tt * g_bh * (1.0 - 0.45 * min(g_bl / max(g_bh, 0.001), 1.0) * g_t2) * (1.0 - g_squash * 0.35);
vec3 g_fn = normalize(vec3(g_dir.x, 0.0, g_dir.y) + vec3(g_side.x, 0.0, g_side.y) * position.x * 1.4);
vec3 objectNormal = normalize(mix(vec3(0.0, 1.0, 0.0), g_fn, 0.32) + vec3(g_bend.x, 0.0, g_bend.y) * 0.25);
vec3 g_tint = grassTint(g_wp);
vec3 g_wc = mix(uWheatA, uWheatB, aRand.x);
vec3 g_tip = mix(g_tint * 1.5 + vec3(0.02, 0.03, 0.0), g_wc * 1.12, g_wheat);
vec3 g_root = mix(g_tint * 0.4, g_wc * 0.45, g_wheat);
vGColor = mix(g_root, g_tip, smoothstep(0.0, 1.0, g_tt)) * (0.85 + 0.3 * fract(aRand.y * 13.1));
vGColor = mix(vGColor, vGColor * vec3(1.18, 1.06, 0.68), smoothstep(0.7, 1.0, g_tt) * step(0.82, fract(aRand.x * 17.3)) * (1.0 - g_wheat));
`;
      const flowerBody = `
vec2 g_rel = mod(aOffset - uCam + 0.5 * uPatch, uPatch) - 0.5 * uPatch;
vec2 g_wp = uCam + g_rel;
float g_dist = length(g_rel);
vec2 g_uv = ((g_wp - uWorld.xy) / uWorld.w + 0.5) / uRes;
vec4 g_gm = texture2D(uGrassMap, g_uv);
float g_keep = step(aRand.w, g_gm.b * 1.2) * (1.0 - smoothstep(uRange.z, uRange.w, g_dist));
float g_h = mix(0.28, 0.55, aRand.x) * g_keep;
float g_s = mix(0.8, 1.35, aRand.y) * g_keep;
float g_gust = vnoise(g_wp * 0.03 + vec2(uTime * 0.21, uTime * 0.09));
vec2 g_sway = normalize(vec2(1.0, 0.35)) * (0.1 + g_gust * 0.25) * sin(uTime * 2.3 + aRand.z * 6.28);
vec3 g_pos = vec3(g_wp.x, terrainH(g_wp), g_wp.y);
vec3 lp = position;
lp.xz *= g_s;
g_pos.xz += lp.xz + g_sway * lp.y * g_h;
g_pos.y += lp.y * g_h;
vec3 objectNormal = vec3(0.0, 1.0, 0.0);
vec3 g_pal[5];
g_pal[0] = vec3(1.0, 0.97, 0.9); g_pal[1] = vec3(1.0, 0.82, 0.15); g_pal[2] = vec3(0.72, 0.4, 1.0); g_pal[3] = vec3(1.0, 0.45, 0.6); g_pal[4] = vec3(0.35, 0.6, 1.0);
int g_pi = int(floor(fract(aRand.z * 3.7 + g_wp.x * 0.013) * 4.99));
vec3 g_petal = g_pal[g_pi];
vGColor = aPart < 0.5 ? grassTint(g_wp) * 0.9 : (aPart < 1.5 ? g_petal : vec3(1.0, 0.8, 0.2));
`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', head)
        .replace('#include <beginnormal_vertex>', flower ? flowerBody : grassBody)
        .replace('#include <begin_vertex>', 'vec3 transformed = g_pos;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGColor;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb *= vGColor;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
        .replace('#include <lights_fragment_begin>', THREE_CHUNKS.lights_fragment_begin_patched(flower ? '0.3' : '0.6', '3.0'));
    };
    mat.customProgramCacheKey = () => (flower ? 'flower-v1' : 'grass-v1');
    return mat;
  }

  _layer({ segs, count, patch, range, width, widen, far, hscale = 1, flower = false }) {
    const geo = flower ? flowerGeometry() : bladeGeometry(segs);
    const rand = mulberry32(far ? 77 : flower ? 99 : 55);
    const off = new Float32Array(count * 2), rnd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      off[i * 2] = rand() * patch; off[i * 2 + 1] = rand() * patch;
      rnd[i * 4] = rand(); rnd[i * 4 + 1] = rand(); rnd[i * 4 + 2] = rand(); rnd[i * 4 + 3] = rand();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 4));
    geo.instanceCount = count;
    const uniforms = {
      uCam: { value: new THREE.Vector2() }, uPatch: { value: patch },
      uRange: { value: new THREE.Vector4(...range) }, uWidth: { value: width }, uWiden: { value: widen }, uFar: { value: far ? 1 : 0 },
      uHScale: { value: hscale },
    };
    const mesh = new THREE.Mesh(geo, this._material(uniforms, flower));
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.gfx.scene.add(mesh);
    return { mesh, uniforms, patch };
  }

  build(q) {
    for (const l of this.layers) { this.gfx.scene.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose(); }
    const [r1, r2] = q.grassR;
    this.layers = [
      this._layer({ segs: 4, count: q.grassNear, patch: r1 * 2, range: [r1 * 0.72, r1, 1e5, 1e5 + 1], width: 0.075, widen: 0.004, far: false }),
      this._layer({ segs: 2, count: q.grassFar, patch: r2 * 2, range: [r1 * 0.72, r1, r2 * 0.78, r2], width: 0.2, widen: 0.006, far: true, hscale: 1.05 }),
      this._layer({ segs: 0, count: q.flowers, patch: 90, range: [0, 0, 32, 45], width: 1, widen: 0, far: false, flower: true }),
    ];
  }

  update(time, cam, forward, pushers) {
    this.shared.uTime.value = time;
    for (const l of this.layers) {
      const ahead = l.patch * 0.22;
      l.uniforms.uCam.value.set(cam.x + forward.x * ahead, cam.z + forward.z * ahead);
    }
    const P = this.shared.uPush.value;
    for (let i = 0; i < 6; i++) {
      const p = pushers[i];
      if (p) P[i].set(p.x, p.y, p.z, p.r); else P[i].set(0, 0, 0, 0);
    }
  }
}
