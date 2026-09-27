import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

const KEYS = [
  { e: -0.4, zen: 0x040816, hor: 0x0e1830, glow: 0x16203c, sun: 0x8ea6ff, hemiS: 0x2a3b66, hemiG: 0x0b0f16, hemiI: 0.55, env: 0.35, fogD: 0.0021, exp: 1.25 },
  { e: -0.1, zen: 0x141d44, hor: 0x4b3f6e, glow: 0xb45a58, sun: 0xff8a5a, hemiS: 0x44507a, hemiG: 0x14131a, hemiI: 0.5, env: 0.35, fogD: 0.0021, exp: 1.2 },
  { e: 0.0, zen: 0x2b4786, hor: 0xe88f62, glow: 0xff8a45, sun: 0xff8f52, hemiS: 0x7488b8, hemiG: 0x2a2018, hemiI: 0.45, env: 0.45, fogD: 0.0019, exp: 1.08 },
  { e: 0.1, zen: 0x3a67b8, hor: 0xf1c29a, glow: 0xffb06a, sun: 0xffbe82, hemiS: 0x8fb0e0, hemiG: 0x3a3020, hemiI: 0.42, env: 0.55, fogD: 0.0017, exp: 1.0 },
  { e: 0.3, zen: 0x3576d4, hor: 0xb9d6ef, glow: 0xffefd6, sun: 0xfff0dc, hemiS: 0x9cc4f0, hemiG: 0x3d3a28, hemiI: 0.4, env: 0.62, fogD: 0.0015, exp: 0.95 },
  { e: 1.0, zen: 0x2a6bd6, hor: 0xa9cff2, glow: 0xffffff, sun: 0xffffff, hemiS: 0xa4ccf4, hemiG: 0x3f3d2a, hemiI: 0.4, env: 0.65, fogD: 0.0014, exp: 0.92 },
];

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function lerpKey(e) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((e - a.e) / (b.e - a.e), 0, 1);
  const col = (k) => tmpA.setHex(a[k]).lerp(tmpB.setHex(b[k]), t).clone();
  const num = (k) => a[k] + (b[k] - a[k]) * t;
  return { zen: col('zen'), hor: col('hor'), glow: col('glow'), sun: col('sun'), hemiS: col('hemiS'), hemiG: col('hemiG'), hemiI: num('hemiI'), env: num('env'), fogD: num('fogD'), exp: num('exp') };
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uMoonDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSunColor; uniform vec3 uGround;
uniform float uTime; uniform float uNight; uniform float uCloud; uniform float uSunVis;
varying vec3 vDir;
${NOISE_GLSL}
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float hp = max(h, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(hp, 0.42));
  float sd = max(dot(dir, uSunDir), 0.0);
  float horizonBand = 1.0 - smoothstep(0.0, 0.45, hp);
  col += uGlow * pow(sd, 5.0) * horizonBand * 0.85;
  col += uSunColor * pow(sd, 48.0) * 0.45 * uSunVis;
  col += uSunColor * smoothstep(0.99955, 0.99978, sd) * 40.0 * uSunVis;
  // stars + moon
  if (uNight > 0.01) {
    vec3 sp = dir * 260.0;
    float s = hash13(floor(sp));
    float star = smoothstep(0.9965, 1.0, s) * (0.6 + 0.4 * sin(uTime * 3.0 + s * 100.0));
    col += vec3(0.85, 0.9, 1.0) * star * uNight * smoothstep(0.02, 0.2, h) * 3.0;
    float md = max(dot(dir, uMoonDir), 0.0);
    col += vec3(0.8, 0.85, 1.0) * smoothstep(0.99935, 0.99955, md) * 6.0 * uNight;
    col += vec3(0.3, 0.4, 0.7) * pow(md, 90.0) * 0.6 * uNight;
  }
  // stylised cloud layer
  if (h > -0.02) {
    vec2 uv = dir.xz / (h + 0.14) * 1.35;
    uv += uTime * vec2(0.0055, 0.0022);
    vec2 warp = vec2(fbm2(uv * 0.55 + 3.1), fbm2(uv * 0.55 - 7.7)) - 0.5;
    vec2 cuv = uv + warp * 0.9;
    float n = fbm2(cuv * 1.25);
    float dens = smoothstep(uCloud, uCloud + 0.22, n);
    float nl = fbm2((cuv + uSunDir.xz * 0.07) * 1.25);
    float shade = clamp(0.62 + (n - nl) * 4.0, 0.0, 1.0);
    vec3 lit = mix(vec3(1.0), uSunColor, 0.55) * (1.05 - uNight * 0.75);
    vec3 shadowC = mix(uZenith, uHorizon, 0.55) * 0.82;
    vec3 cc = mix(shadowC, lit, shade);
    cc += uGlow * pow(sd, 6.0) * (1.0 - dens) * 1.4 * uSunVis;
    float a = dens * smoothstep(-0.01, 0.2, h) * 0.95;
    col = mix(col, cc, a);
  }
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(gfx) {
    this.gfx = gfx;
    const scene = gfx.scene;
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() }, uGround: { value: new THREE.Color(0x2a3140) },
      uTime: { value: 0 }, uNight: { value: 0 }, uCloud: { value: 0.52 }, uSunVis: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
    const geo = new THREE.SphereGeometry(3000, 48, 24);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    scene.add(this.mesh);

    this.envScene = new THREE.Scene();
    const envMesh = new THREE.Mesh(geo, mat);
    this.envScene.add(envMesh);
    this.pmrem = new THREE.PMREMGenerator(gfx.renderer);
    this.envRT = null;
    this.lastEnvE = -9;
    this.envTimer = 0;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xaaccff, 0x334422, 0.4);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xb9d6ef, 0.0016);
    this.override = 'auto';
    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.nightFactor = 0;
    this.applyShadowQuality();
    this._m = new THREE.Matrix4();
    this._mi = new THREE.Matrix4();
    this._v = new THREE.Vector3();
  }

  applyShadowQuality() {
    const q = this.gfx.q;
    const s = this.sun.shadow;
    s.mapSize.set(q.shadow, q.shadow);
    const r = q.shadowRange;
    s.camera.left = -r; s.camera.right = r; s.camera.top = r; s.camera.bottom = -r;
    s.camera.near = 1; s.camera.far = 900;
    s.camera.updateProjectionMatrix();
    if (s.map) { s.map.dispose(); s.map = null; }
    this.range = r;
  }

  dayTimeFor(t) {
    switch (this.override) {
      case 'golden': return 0.705;
      case 'noon': return 0.5;
      case 'dusk': return 0.745;
      case 'night': return 0.93;
      default: return t;
    }
  }

  update(dt, dayTime, focus, time) {
    const u = this.uniforms;
    const dtm = this.dayTimeFor(dayTime);
    const a = (dtm - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(a) * 0.92, Math.sin(a) * 0.82, 0.38).normalize();
    const e = this.sunDir.y;
    const k = lerpKey(e);
    u.uSunDir.value.copy(this.sunDir);
    const moon = this._v.copy(this.sunDir).multiplyScalar(-1);
    moon.y = Math.abs(moon.y) * 0.8 + 0.25; moon.normalize();
    u.uMoonDir.value.copy(moon);
    u.uZenith.value.copy(k.zen); u.uHorizon.value.copy(k.hor); u.uGlow.value.copy(k.glow); u.uSunColor.value.copy(k.sun);
    u.uGround.value.copy(k.hor).multiplyScalar(0.35);
    u.uTime.value = time;
    this.nightFactor = THREE.MathUtils.smoothstep(-e, 0.02, 0.22);
    u.uNight.value = this.nightFactor;
    u.uSunVis.value = THREE.MathUtils.smoothstep(e, -0.04, 0.02);

    // key light: sun by day, moon by night
    let intensity, color;
    if (e > 0.0) {
      this.lightDir.copy(this.sunDir);
      intensity = 3.1 * THREE.MathUtils.smoothstep(e, 0.0, 0.28) + 0.25;
      color = k.sun;
      if (e < 0.06) intensity *= THREE.MathUtils.smoothstep(e, 0.0, 0.06) * 0.9 + 0.1;
    } else {
      this.lightDir.copy(moon);
      intensity = 0.55 * THREE.MathUtils.smoothstep(-e, 0.0, 0.12);
      color = tmpA.setHex(0x9fb6ff);
    }
    this.sun.color.copy(color);
    this.sun.intensity = intensity;
    this.hemi.color.copy(k.hemiS);
    this.hemi.groundColor.copy(k.hemiG);
    this.hemi.intensity = k.hemiI;
    const scene = this.gfx.scene;
    scene.fog.color.copy(k.hor).lerp(k.zen, 0.12);
    scene.fog.density = k.fogD;
    scene.environmentIntensity = k.env;
    this.gfx.renderer.toneMappingExposure = k.exp;
    this.exposure = k.exp;

    // shadow camera follows focus with texel snapping
    const r = this.range;
    const texel = (2 * r) / this.gfx.q.shadow;
    this._m.lookAt(new THREE.Vector3(0, 0, 0), this._v.copy(this.lightDir).negate(), new THREE.Vector3(0, 1, 0));
    this._mi.copy(this._m).invert();
    const c = new THREE.Vector3(focus.x, focus.y, focus.z).applyMatrix4(this._mi);
    c.x = Math.round(c.x / texel) * texel; c.y = Math.round(c.y / texel) * texel;
    c.applyMatrix4(this._m);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(this.lightDir, 420);
    this.sun.target.updateMatrixWorld();

    this.mesh.position.copy(this.gfx.camera.position);

    this.envTimer -= dt;
    if (this.envTimer <= 0 || Math.abs(e - this.lastEnvE) > 0.03) {
      this.envTimer = 6;
      this.lastEnvE = e;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 1, 5000);
      scene.environment = this.envRT.texture;
    }
  }
}
