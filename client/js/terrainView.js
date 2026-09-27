import * as THREE from 'three';
import { NOISE_GLSL, GRASS_TINT_GLSL } from './glsl.js';

const C = (hex) => new THREE.Color(hex);

export function makeGridTextures(terrain) {
  const res = terrain.res;
  const height = new THREE.DataTexture(terrain.heights, res, res, THREE.RedFormat, THREE.FloatType);
  height.minFilter = height.magFilter = THREE.NearestFilter;
  height.needsUpdate = true;
  const splat = new THREE.DataTexture(terrain.splat, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
  splat.minFilter = splat.magFilter = THREE.LinearFilter;
  splat.needsUpdate = true;
  const grass = new THREE.DataTexture(terrain.grass, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
  grass.minFilter = grass.magFilter = THREE.LinearFilter;
  grass.needsUpdate = true;
  const depth = new Uint8Array(res * res);
  for (let i = 0; i < depth.length; i++) depth[i] = Math.max(0, Math.min(255, (-terrain.heights[i] / 12) * 255));
  const depthTex = new THREE.DataTexture(depth, res, res, THREE.RedFormat, THREE.UnsignedByteType);
  depthTex.minFilter = depthTex.magFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;
  return {
    height, splat, grass, depth: depthTex,
    world: new THREE.Vector4(-terrain.half, -terrain.half, terrain.size, terrain.cell),
    res,
  };
}

export const GRASS_COLORS = {
  uGrassA: { value: C(0x5f9e32) },
  uGrassB: { value: C(0x3f7a26) },
  uGrassC: { value: C(0xa8ad4c) },
};

export class TerrainView {
  constructor(gfx, terrain, tex) {
    this.gfx = gfx;
    this.terrain = terrain;
    this.tex = tex;
    const uniforms = {
      uSplat: { value: tex.splat }, uGrassMap: { value: tex.grass }, uWorld: { value: tex.world }, uRes: { value: tex.res },
      uForestA: { value: C(0x3c4a1f) }, uForestB: { value: C(0x584226) },
      uDirtA: { value: C(0x8c6b45) }, uDirtB: { value: C(0xab8a5f) },
      uFieldA: { value: C(0xb89e54) }, uFieldB: { value: C(0x8b7442) },
      uSandA: { value: C(0xdcca94) }, uSandB: { value: C(0xc4ae7a) },
      uRockA: { value: C(0x6f6b66) }, uRockB: { value: C(0xa39c91) },
      uSnow: { value: C(0xf1f6fb) },
      uCobA: { value: C(0x9a948c) }, uCobB: { value: C(0x76716b) },
      ...GRASS_COLORS,
    };
    this.uniforms = uniforms;
    this.lq = !!gfx.q.lq;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 });
    mat.customProgramCacheKey = () => (this.lq ? 'terrain-lq' : 'terrain-hq');
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);');
      shader.fragmentShader = (this.lq ? '#define TINT_LQ\n#define TERRAIN_LQ\n' : '') + shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D uSplat; uniform sampler2D uGrassMap; uniform vec4 uWorld; uniform float uRes;
uniform vec3 uForestA, uForestB, uDirtA, uDirtB, uFieldA, uFieldB, uSandA, uSandB, uRockA, uRockB, uSnow, uCobA, uCobB;
varying vec3 vWPos; varying vec3 vWNormal;
${NOISE_GLSL}
${GRASS_TINT_GLSL}
vec3 bumpN(vec3 surf_pos, vec3 surf_norm, float h) {
  vec3 sx = dFdx(surf_pos); vec3 sy = dFdy(surf_pos);
  vec3 r1 = cross(sy, surf_norm); vec3 r2 = cross(surf_norm, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surf_norm - g);
}
`)
        .replace('#include <map_fragment>', `
vec2 wp = vWPos.xz;
vec2 guv = ((wp - uWorld.xy) / uWorld.w + 0.5) / uRes;
vec4 sp = texture2D(uSplat, guv);
vec4 gm = texture2D(uGrassMap, guv);
vec3 wn = normalize(vWNormal);
float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
#ifdef TERRAIN_LQ
float n1 = vnoise(wp * 0.03);
#else
float n1 = fbm2(wp * 0.03);
#endif
float n2 = vnoise(wp * 0.37);
float n3 = vnoise(wp * 2.3);
vec3 tcol = grassTint(wp) * (0.78 + 0.24 * n2);
vec3 forest = mix(uForestA, uForestB, n2) * (0.8 + 0.3 * n3);
tcol = mix(tcol, forest, sp.a * 0.7);
vec3 field = mix(uFieldA, uFieldB, n3);
tcol = mix(tcol, field, sp.g);
vec3 dirt = mix(uDirtA, uDirtB, n2 * 0.7 + n3 * 0.3) * (0.85 + 0.25 * vnoise(wp * 6.0));
float peb = smoothstep(0.74, 0.8, vnoise(wp * 9.0)) * smoothstep(0.3, 0.7, vnoise(wp * 0.8));
dirt = mix(dirt, uRockB * 0.85, peb * 0.35);
float wRoad = smoothstep(0.1, 0.9, sp.r);
tcol = mix(tcol, dirt, wRoad);
#ifdef TERRAIN_LQ
vec2 cgr = wp * 1.15;
cgr.x += step(0.5, fract(cgr.y * 0.5)) * 0.5;
vec2 cfr = fract(cgr);
float cedge = min(min(cfr.x, 1.0 - cfr.x), min(cfr.y, 1.0 - cfr.y));
vec2 vr = vec2(cedge * 0.6, hash12(floor(cgr)));
#else
vec2 vr = voronoi(wp * 1.15);
#endif
float grout = smoothstep(0.02, 0.1, vr.x);
vec3 cob = mix(uCobA, uCobB, vr.y) * (0.9 + 0.2 * n3);
cob = mix(uCobB * 0.42, cob, grout);
float wPl = smoothstep(0.35, 0.7, sp.b);
tcol = mix(tcol, cob, wPl);
float wRock = max(gm.a, smoothstep(0.5, 0.64, slope));
float ry = vWPos.y;
float rn1 = vnoise(vec2(wp.x * 0.45 + ry * 0.38, wp.y * 0.45 - ry * 0.31));
float rn2 = vnoise(vec2(wp.x * 1.7 - ry * 1.2, wp.y * 1.7 + ry * 1.4));
float rn3 = vnoise(vec2(wp.x * 5.1 + ry * 3.3, wp.y * 5.1 - ry * 2.9));
float strata = sin(ry * 0.9 + rn1 * 4.0) * 0.5 + 0.5;
float crev = smoothstep(0.35, 0.05, abs(rn2 - 0.5));
vec3 rock = mix(uRockA, uRockB, strata * 0.3 + rn2 * 0.45 + rn3 * 0.25) * (0.78 + 0.32 * rn1) * (1.0 - crev * 0.28);
rock = mix(rock, grassTint(wp) * 0.8, smoothstep(0.62, 0.9, rn1) * smoothstep(0.75, 0.5, slope) * 0.6);
tcol = mix(tcol, rock, wRock);
float wSand = (1.0 - smoothstep(0.9, 2.4, vWPos.y + (n2 - 0.5) * 0.8)) * (1.0 - wPl);
vec3 sand = mix(uSandA, uSandB, n2 * 0.6 + n3 * 0.4);
tcol = mix(tcol, sand, wSand);
tcol *= mix(1.0, 0.72, smoothstep(0.9, 0.15, vWPos.y) * wSand);
float wSnow = smoothstep(96.0, 112.0, vWPos.y + n1 * 14.0) * (1.0 - smoothstep(0.6, 0.8, slope));
tcol = mix(tcol, uSnow, wSnow);
tcol *= mix(1.0, 0.5, smoothstep(0.0, -5.0, vWPos.y));
diffuseColor.rgb = tcol;
float tRough = mix(0.96, 0.7, wSnow);
tRough = mix(tRough, 0.5, smoothstep(0.7, 0.05, vWPos.y) * wSand);
float tBump = (1.0 - grout) * -0.05 * wPl + (rn2 * 0.35 + rn3 * 0.12 - crev * 0.15) * wRock + n3 * 0.02 + peb * 0.03 * wRoad;
`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', '#ifndef TERRAIN_LQ\nnormal = bumpN(-vViewPosition, normal, tBump);\n#endif');
    };
    this.material = mat;
    this.chunks = [];
    const N = 8;
    const res = terrain.res;
    const per = (res - 1) / N;
    const H = terrain.heights;
    const normals = this._normals();
    for (let cz = 0; cz < N; cz++) {
      for (let cx = 0; cx < N; cx++) {
        const vx = per + 1;
        const pos = new Float32Array(vx * vx * 3);
        const nor = new Float32Array(vx * vx * 3);
        let k = 0;
        for (let j = 0; j < vx; j++) {
          for (let i = 0; i < vx; i++) {
            const gi = cx * per + i, gj = cz * per + j;
            const idx = gj * res + gi;
            pos[k] = -terrain.half + gi * terrain.cell;
            pos[k + 1] = H[idx];
            pos[k + 2] = -terrain.half + gj * terrain.cell;
            nor[k] = normals[idx * 3]; nor[k + 1] = normals[idx * 3 + 1]; nor[k + 2] = normals[idx * 3 + 2];
            k += 3;
          }
        }
        const index = new Uint32Array(per * per * 6);
        let q = 0;
        for (let j = 0; j < per; j++) {
          for (let i = 0; i < per; i++) {
            const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
            index[q++] = a; index[q++] = c; index[q++] = b;
            index[q++] = b; index[q++] = c; index[q++] = d;
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setIndex(new THREE.BufferAttribute(index, 1));
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        m.castShadow = true;
        gfx.scene.add(m);
        this.chunks.push(m);
      }
    }
  }

  setLQ(v) {
    if (this.lq === !!v) return;
    this.lq = !!v;
    this.material.needsUpdate = true;
  }

  _normals() {
    const t = this.terrain, res = t.res, H = t.heights, c = t.cell;
    const out = new Float32Array(res * res * 3);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const hl = H[j * res + Math.max(0, i - 1)], hr = H[j * res + Math.min(res - 1, i + 1)];
        const hd = H[Math.max(0, j - 1) * res + i], hu = H[Math.min(res - 1, j + 1) * res + i];
        const nx = hl - hr, nz = hd - hu, ny = 2 * c;
        const l = Math.hypot(nx, ny, nz);
        const k = (j * res + i) * 3;
        out[k] = nx / l; out[k + 1] = ny / l; out[k + 2] = nz / l;
      }
    }
    return out;
  }
}
