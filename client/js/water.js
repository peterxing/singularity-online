import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uAmbient;
uniform sampler2D uDepth; uniform vec4 uWorld; uniform float uRes; uniform float uNight;
varying vec3 vWPos;
${NOISE_GLSL}
vec2 wave(vec2 p, vec2 d, float freq, float amp, float speed) {
  float ph = dot(p, d) * freq + uTime * speed;
  return d * cos(ph) * freq * amp;
}
void main() {
  vec2 p = vWPos.xz;
  vec3 V = normalize(cameraPosition - vWPos);
  float distCam = length(cameraPosition - vWPos);
  vec2 g = vec2(0.0);
  g += wave(p, normalize(vec2(1.0, 0.35)), 0.12, 0.22, 1.1);
  g += wave(p, normalize(vec2(-0.6, 1.0)), 0.21, 0.12, 1.5);
  g += wave(p, normalize(vec2(0.3, -1.0)), 0.37, 0.06, 2.1);
  g += wave(p, normalize(vec2(-1.0, -0.2)), 0.63, 0.035, 2.9);
  float fade = 1.0 - smoothstep(60.0, 400.0, distCam);
  vec2 q = p * 0.6 + uTime * vec2(0.18, 0.11);
  float e = 0.08;
  float n0 = vnoise(q), nx = vnoise(q + vec2(e, 0.0)), nz = vnoise(q + vec2(0.0, e));
  g += vec2(nx - n0, nz - n0) / e * 0.10 * fade;
  vec2 q2 = p * 1.7 - uTime * vec2(0.13, 0.21);
  float m0 = vnoise(q2), mx = vnoise(q2 + vec2(e, 0.0)), mz = vnoise(q2 + vec2(0.0, e));
  g += vec2(mx - m0, mz - m0) / e * 0.05 * fade;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec2 guv = ((p - uWorld.xy) / uWorld.w + 0.5) / uRes;
  float inside = step(0.0, guv.x) * step(guv.x, 1.0) * step(0.0, guv.y) * step(guv.y, 1.0);
  float depth = mix(12.0, texture2D(uDepth, clamp(guv, 0.0, 1.0)).r * 12.0, inside);
  float NV = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = mix(uHorizon, uZenith, pow(max(R.y, 0.0), 0.45));
  float sd = max(dot(R, uSunDir), 0.0);
  sky += uSunColor * pow(sd, 12.0) * 0.4;
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 7.0, depth));
  float lightAmt = uAmbient + max(uSunDir.y, 0.0) * uSunI * 0.22;
  body *= lightAmt;
  vec3 col = mix(body, sky, clamp(fres * 1.05, 0.0, 1.0));
  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 600.0) * 30.0 + pow(nh, 60.0) * 0.35;
  col += uSunColor * spec * uSunI * 0.35 * step(0.0, uSunDir.y);
  float fn = vnoise(p * 0.8 + uTime * 0.25) * vnoise(p * 2.2 - uTime * 0.18);
  float edge = 1.0 - smoothstep(0.0, 0.7, depth);
  float band = smoothstep(0.55, 0.9, sin(depth * 5.0 - uTime * 1.7 + fn * 5.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.2, 2.2, depth));
  float foam = clamp(edge * 0.85 + band * 0.55, 0.0, 1.0) * smoothstep(0.08, 0.38, fn + 0.18) * inside;
  col = mix(col, vec3(0.92, 0.96, 1.0) * (uAmbient + 0.35 * uSunI * 0.3), foam * 0.85);
  float alpha = mix(0.35, 0.94, smoothstep(0.0, 3.2, depth));
  alpha = max(alpha, fres * 0.9);
  alpha = max(alpha, foam);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

export class Water {
  constructor(gfx, tex, sky) {
    this.sky = sky;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uSunI: { value: 1 },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color(0x0b4a63) }, uShallow: { value: new THREE.Color(0x2fa4a8) }, uAmbient: { value: 0.6 },
      uDepth: { value: null }, uWorld: { value: new THREE.Vector4() }, uRes: { value: 1 }, uNight: { value: 0 },
    }]);
    this.uniforms.uDepth.value = tex.depth;
    this.uniforms.uWorld.value = tex.world;
    this.uniforms.uRes.value = tex.res;
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, fog: true, depthWrite: true });
    const geo = new THREE.PlaneGeometry(7000, 7000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    gfx.scene.add(this.mesh);
  }

  update(time) {
    const u = this.uniforms, s = this.sky;
    u.uTime.value = time;
    u.uSunDir.value.copy(s.lightDir);
    u.uSunColor.value.copy(s.sun.color);
    u.uSunI.value = s.sun.intensity;
    u.uZenith.value.copy(s.uniforms.uZenith.value);
    u.uHorizon.value.copy(s.uniforms.uHorizon.value);
    u.uAmbient.value = 0.18 + (1 - s.nightFactor) * 0.55;
    u.uNight.value = s.nightFactor;
  }
}
