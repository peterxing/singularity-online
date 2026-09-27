import * as THREE from 'three';
import { NOISE_GLSL, TERRAIN_HEIGHT_GLSL } from './glsl.js';
import { starTexture } from './textures.js';

const V3 = THREE.Vector3;
const tmp = new V3(), tmp2 = new V3();

// ------------------------------------------------------------------ particles
class Particles {
  constructor(scene, cap, blending) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.next = 0;
    this.hi = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    this.uniforms = { uScale: { value: 600 }, uSoft: { value: blending === THREE.AdditiveBlending ? 1 : 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vCol;
        void main() { vCol = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / max(0.1, -mv.z); }`,
      fragmentShader: /* glsl */ `
        varying vec4 vCol; uniform float uSoft;
        void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard;
          float a = uSoft > 0.5 ? pow(1.0 - d, 1.8) : smoothstep(1.0, 0.2, d);
          gl_FragColor = vec4(vCol.rgb, vCol.a * a); }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, r, g, b, a, size, life, drag = 0, grav = 0, sizeEnd = null) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    if (i + 1 > this.hi) this.hi = i + 1;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.a0[i] = a; this.s0[i] = size; this.s1[i] = sizeEnd === null ? size * 0.2 : sizeEnd;
    this.life[i] = life; this.max[i] = life; this.drag[i] = drag; this.grav[i] = grav;
    this.size[i] = size;
  }
  update(dt) {
    const n = this.hi;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const i3 = i * 3;
      const d = 1 - this.drag[i] * dt;
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const fadeIn = Math.min(1, (1 - k) * 8);
      this.col[i * 4 + 3] = this.a0[i] * Math.min(k * 1.6, 1) * fadeIn;
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    this.points.geometry.setDrawRange(0, n);
  }
}

// ------------------------------------------------------------------ beams
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uAlpha; varying vec2 vUv;
${NOISE_GLSL}
void main() {
  float w = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float core = pow(w, 5.0);
  float glow = pow(w, 1.6);
  float n = vnoise(vec2(vUv.y * 18.0 - uTime * 14.0, vUv.x * 4.0 + uTime));
  float ends = smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
  vec3 c = uColor * (core * 4.0 + glow * (0.5 + n));
  gl_FragColor = vec4(c, (core + glow * 0.6) * uAlpha * ends);
}`;

function beamGeometry() {
  const g = new THREE.BufferGeometry();
  const p = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 1, 0, -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}

// ------------------------------------------------------------------ decals
const DECAL_VERT = /* glsl */ `
${TERRAIN_HEIGHT_GLSL}
uniform vec2 uCenter; uniform float uRadius; uniform float uLift;
varying vec2 vLocal;
void main() {
  vLocal = position.xz * 2.0;
  vec2 wp = uCenter + position.xz * 2.0 * uRadius;
  float h = max(terrainH(wp), 0.02);
  vec4 mv = viewMatrix * vec4(wp.x, h + uLift, wp.y, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const DECAL_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; uniform float uProgress; uniform float uTime; uniform int uMode;
varying vec2 vLocal;
void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  float a = 0.0;
  vec3 c = uColor;
  float ang = atan(vLocal.y, vLocal.x);
  if (uMode == 0) {
    float ring = smoothstep(0.78, 0.86, d) * (1.0 - smoothstep(0.94, 1.0, d));
    float dash = step(0.35, fract(ang * 3.0 / 3.14159 + uTime * 0.25));
    a = ring * (0.65 + 0.35 * dash) + smoothstep(1.0, 0.0, d) * 0.1;
    c *= 1.6;
  } else if (uMode == 1) {
    float r = uProgress;
    float ring = exp(-pow((d - r) * 9.0, 2.0));
    a = ring * (1.0 - uProgress) * 1.4;
    c *= 3.0;
  } else if (uMode == 2) {
    float edge = smoothstep(0.9, 0.97, d) * (1.0 - smoothstep(0.98, 1.0, d));
    float fill = step(d, uProgress) * 0.35 + smoothstep(uProgress - 0.04, uProgress, d) * step(d, uProgress) * 0.6;
    a = edge * 0.9 + fill * 0.8;
    c *= 1.8;
  } else if (uMode == 3) {
    float rings = smoothstep(0.02, 0.0, abs(d - 0.95)) + smoothstep(0.015, 0.0, abs(d - 0.7));
    float spokes = smoothstep(0.08, 0.0, abs(sin(ang * 6.0 + uTime))) * step(0.7, d) * step(d, 0.95);
    float glyph = step(0.5, fract(ang * 12.0 / 6.28318 - uTime * 0.2)) * smoothstep(0.02, 0.0, abs(d - 0.82)) ;
    a = (rings + spokes * 0.6 + glyph) * 0.9 + (1.0 - d) * 0.12;
    c *= 2.5;
  } else {
    a = smoothstep(1.0, 0.1, d) * 0.55;
    c = vec3(0.0);
  }
  gl_FragColor = vec4(c, a * uAlpha);
}`;

// ------------------------------------------------------------------ main class
export class VFX {
  constructor(gfx, tex) {
    this.gfx = gfx;
    this.scene = gfx.scene;
    this.tex = tex;
    this.add = new Particles(gfx.scene, 9000, THREE.AdditiveBlending);
    this.smoke = new Particles(gfx.scene, 3000, THREE.NormalBlending);
    this.items = [];
    this.emitters = [];
    this.trauma = 0;
    this.time = 0;
    this.beamGeo = beamGeometry();
    this.decalGeo = new THREE.PlaneGeometry(1, 1, 24, 24);
    this.decalGeo.rotateX(-Math.PI / 2);
    this.decalShared = { uHeightTex: { value: tex.height }, uWorld: { value: tex.world }, uRes: { value: tex.res } };
    this.sphereGeo = new THREE.SphereGeometry(1, 16, 12);
    this.coneGeo = new THREE.ConeGeometry(0.12, 0.5, 8);
    this.coneGeo.rotateX(Math.PI / 2);
    this.starTex = starTexture();
    this.fctRoot = document.getElementById('fct');
    this.fct = [];
  }

  color(hex) { const c = new THREE.Color(hex); return c; }

  burst(p, hex, n = 20, speed = 4, size = 0.3, life = 0.6, opts = {}) {
    const c = this.color(hex);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const sp = speed * (0.3 + Math.random() * 0.7);
      const up = opts.up || 0;
      this.add.spawn(p.x, p.y, p.z, s * Math.cos(th) * sp, u * sp * (opts.flat ? 0.2 : 1) + up, s * Math.sin(th) * sp,
        c.r * (opts.hdr || 2), c.g * (opts.hdr || 2), c.b * (opts.hdr || 2), 1, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), opts.drag ?? 2.5, opts.grav ?? 0);
    }
  }

  dust(p, n = 12, radius = 1, hex = 0xb8a88a) {
    const c = this.color(hex);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      this.smoke.spawn(p.x + Math.cos(a) * r, p.y + 0.2, p.z + Math.sin(a) * r, Math.cos(a) * 2, 0.8 + Math.random(), Math.sin(a) * 2,
        c.r, c.g, c.b, 0.45, 0.8 + Math.random() * 0.6, 1.1 + Math.random() * 0.6, 1.8, -0.2, 2.2);
    }
  }

  // --- projectiles
  projectile(fromFn, toFn, dur, kind = 'bolt', hex = 0xffaa33) {
    const c = this.color(hex);
    const mat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(kind === 'orb' ? 3 : 5), fog: false });
    let mesh;
    if (kind === 'rocket') {
      mesh = new THREE.Mesh(this.coneGeo, new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 0.8, roughness: 0.3, emissive: c, emissiveIntensity: 0.4 }));
      mesh.scale.setScalar(1.6);
    } else {
      mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.scale.setScalar(kind === 'spark' ? 0.12 : kind === 'orb' ? 0.26 : 0.2);
    }
    const start = fromFn().clone();
    this.scene.add(mesh);
    this.items.push({ type: 'proj', mesh, start, toFn, dur: Math.max(0.05, dur), t: 0, kind, c, arc: kind === 'rocket' ? 2.5 : kind === 'orb' ? 0.6 : 0.3, last: start.clone() });
  }

  beam(fromFn, toFn, dur, hex, width = 0.5) {
    const mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: this.color(hex) }, uTime: { value: 0 }, uAlpha: { value: 1 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.beamGeo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.items.push({ type: 'beam', mesh, fromFn, toFn, dur, t: 0, width, hex });
  }

  // --- ground decals
  decal(mode, center, radius, hex, dur = 1, opts = {}) {
    const u = {
      ...this.decalShared,
      uCenter: { value: new THREE.Vector2(center.x, center.z) }, uRadius: { value: radius }, uLift: { value: opts.lift ?? 0.12 },
      uColor: { value: this.color(hex) }, uAlpha: { value: opts.alpha ?? 1 }, uProgress: { value: 0 }, uTime: { value: 0 }, uMode: { value: mode },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, transparent: true, depthWrite: false,
      blending: mode === 4 ? THREE.NormalBlending : THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(this.decalGeo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    const it = { type: 'decal', mesh, u, dur, t: 0, follow: opts.follow || null, persistent: !!opts.persistent };
    if (!opts.persistent) this.items.push(it);
    return it;
  }

  removeDecal(it) { if (!it) return; this.scene.remove(it.mesh); it.mesh.material.dispose(); }

  shockwave(p, radius, hex) { this.decal(1, p, radius, hex, 0.6); }
  telegraph(p, radius, dur, hex = 0xff3a1a, follow = null) { this.decal(2, p, radius, hex, dur, { follow }); }

  // --- composite effects
  nova(p, radius, hex) {
    this.shockwave(p, radius, hex);
    const c = this.color(hex);
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const sp = radius * 1.8;
      this.add.spawn(p.x, p.y + 0.6, p.z, Math.cos(a) * sp, 0.5 + Math.random(), Math.sin(a) * sp, c.r * 3, c.g * 3, c.b * 3, 1, 0.5, 0.55, 2.2, 0);
    }
  }

  slam(p, radius, hex) {
    this.shockwave(p, radius, hex);
    this.dust(p, 22, radius * 0.5);
    this.burst(tmp.set(p.x, p.y + 0.4, p.z), hex, 40, 7, 0.35, 0.5, { flat: true, up: 2, grav: 6 });
  }

  explosion(p, radius, hex) {
    this.shockwave(p, radius, hex);
    this.burst(tmp.set(p.x, p.y + 1, p.z), hex, 70, radius * 1.4, 0.7, 0.8, { up: 2, grav: 2 });
    this.burst(tmp.set(p.x, p.y + 1, p.z), 0xffffff, 20, radius, 0.4, 0.4);
    this.dust(p, 16, radius * 0.6, 0x6a5a4a);
  }

  heal(p, hex = 0x7dffb0) {
    const c = this.color(hex);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.5;
      this.add.spawn(p.x + Math.cos(a) * r, p.y + Math.random() * 1.2, p.z + Math.sin(a) * r, 0, 1.2 + Math.random() * 1.4, 0, c.r * 2.5, c.g * 2.5, c.b * 2.5, 1, 0.22, 1.1, 0.5, -0.5);
    }
  }

  buffSpiral(p, hex) {
    const c = this.color(hex);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 6, r = 0.8;
      this.add.spawn(p.x + Math.cos(a) * r, p.y + (i / 40) * 2.2, p.z + Math.sin(a) * r, -Math.sin(a) * 0.8, 1.2, Math.cos(a) * 0.8, c.r * 2.5, c.g * 2.5, c.b * 2.5, 1, 0.28, 0.9, 1, 0);
    }
  }

  cone(p, dir, range, hex) {
    const c = this.color(hex);
    for (let i = 0; i < 120; i++) {
      const spread = (Math.random() - 0.5) * 1.1;
      const ca = Math.cos(spread), sa = Math.sin(spread);
      const dx = dir.x * ca - dir.z * sa, dz = dir.x * sa + dir.z * ca;
      const sp = range * (1.2 + Math.random() * 1.4);
      const hot = Math.random();
      this.add.spawn(p.x, p.y, p.z, dx * sp, (Math.random() - 0.3) * 2, dz * sp, c.r * 3 + hot, c.g * 2 + hot * 0.6, c.b * 1.5, 1, 0.4 + Math.random() * 0.5, 0.45 + Math.random() * 0.25, 2.2, -1.5, 1.2);
    }
    for (let i = 0; i < 12; i++) this.smoke.spawn(p.x + dir.x * range * 0.6, p.y + 0.5, p.z + dir.z * range * 0.6, dir.x * 3, 1.5, dir.z * 3, 0.15, 0.13, 0.12, 0.4, 1.4, 1.4, 1, -0.3, 3);
  }

  dashTrail(a, b, hex) {
    const c = this.color(hex);
    for (let i = 0; i < 50; i++) {
      const t = Math.random();
      this.add.spawn(a.x + (b.x - a.x) * t, a.y + 1 + (Math.random() - 0.5), a.z + (b.z - a.z) * t, (Math.random() - 0.5), Math.random(), (Math.random() - 0.5), c.r * 2.5, c.g * 2.5, c.b * 2.5, 1, 0.35, 0.6, 2, 0);
    }
  }

  levelUp(p) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 2.6, 0.9), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 14, 24, 1, true), mat);
    mesh.position.set(p.x, p.y + 7, p.z);
    this.scene.add(mesh);
    this.items.push({ type: 'fade', mesh, dur: 1.8, t: 0, base: 0.8, grow: 0.4 });
    this.nova(p, 6, 0xffd24a);
    this.buffSpiral(p, 0xffe07a);
  }

  meteor(target, dur, hex = 0xff4d2a) {
    const mesh = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(5), fog: false }));
    mesh.scale.setScalar(1.3);
    const start = new V3(target.x + 25, target.y + 70, target.z + 12);
    this.scene.add(mesh);
    this.items.push({ type: 'meteor', mesh, start, end: target.clone(), dur, t: 0, hex });
  }

  shieldMesh(hex = 0x9fe0ff) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: this.color(hex) }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float hex = step(0.92, fract(vP.y * 6.0 + uTime * 0.6)) * 0.4;
          gl_FragColor = vec4(uColor * (f * 2.2 + hex * f + 0.05), f * 0.85 + 0.04); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return new THREE.Mesh(this.sphereGeo, mat);
  }

  stunStars() {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.starTex, color: 0xfff08a, depthWrite: false, fog: false }));
      s.scale.setScalar(0.28);
      s.userData.a = (i / 3) * Math.PI * 2;
      g.add(s);
    }
    return g;
  }

  addEmitter(e) { this.emitters.push({ acc: 0, ...e }); }

  shake(v) { this.trauma = Math.min(1, this.trauma + v); }

  // --- floating combat text
  text(worldPos, str, cls = 'dmg') {
    if (!this.fctRoot) return;
    let el = this.fct.find((f) => !f.alive);
    if (!el) {
      if (this.fct.length > 60) return;
      const d = document.createElement('div');
      this.fctRoot.appendChild(d);
      el = { d, alive: false };
      this.fct.push(el);
    }
    el.alive = true;
    el.t = 0;
    el.dur = cls === 'crit' ? 1.4 : 1.1;
    el.pos = worldPos.clone();
    el.dx = (Math.random() - 0.5) * 40;
    el.d.className = 'fct ' + cls;
    el.d.textContent = str;
    el.d.style.display = 'block';
  }

  update(dt, camera, camPos) {
    this.time += dt;
    const h = this.gfx.renderer.domElement.clientHeight || window.innerHeight;
    const scale = (h * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    this.add.uniforms.uScale.value = scale * 0.5;
    this.smoke.uniforms.uScale.value = scale * 0.5;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    // emitters (ambient fire, smoke, sparkles)
    for (const e of this.emitters) {
      if (tmp.set(e.x, e.y, e.z).distanceTo(camPos) > (e.range || 140)) continue;
      e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        this._emit(e);
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      if (it.type === 'proj') {
        const to = it.toFn();
        const e = k * k * (3 - 2 * k) * 0.3 + k * 0.7;
        tmp.lerpVectors(it.start, to, e);
        tmp.y += Math.sin(k * Math.PI) * it.arc;
        const m = it.mesh;
        tmp2.copy(tmp).sub(it.last);
        if (tmp2.lengthSq() > 1e-6 && it.kind === 'rocket') m.lookAt(tmp.clone().add(tmp2));
        m.position.copy(tmp);
        const c = it.c;
        const steps = 3;
        for (let s = 0; s < steps; s++) {
          const f = s / steps;
          const px = it.last.x + (tmp.x - it.last.x) * f, py = it.last.y + (tmp.y - it.last.y) * f, pz = it.last.z + (tmp.z - it.last.z) * f;
          this.add.spawn(px, py, pz, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, c.r * 2.2, c.g * 2.2, c.b * 2.2, 0.9, it.kind === 'rocket' ? 0.5 : 0.32, 0.35, 1.5, 0);
          if (it.kind === 'rocket' && s === 0) this.smoke.spawn(px, py, pz, 0, 0.4, 0, 0.7, 0.7, 0.72, 0.35, 0.5, 1.2, 1, -0.2, 1.8);
        }
        it.last.copy(tmp);
        if (k >= 1) {
          this.burst(tmp, c.getHex(), it.kind === 'rocket' ? 50 : 22, it.kind === 'rocket' ? 7 : 4, it.kind === 'rocket' ? 0.55 : 0.35, 0.5);
          if (it.kind === 'rocket') this.dust(tmp, 8, 1.5, 0x777777);
          this.scene.remove(it.mesh);
          if (it.mesh.material) it.mesh.material.dispose();
          this.items.splice(i, 1);
        }
      } else if (it.type === 'beam') {
        const a = it.fromFn(), b = it.toFn();
        const m = it.mesh;
        m.position.copy(a);
        m.lookAt(b);
        const len = a.distanceTo(b);
        const w = it.width * (0.85 + Math.sin(this.time * 30) * 0.15);
        m.scale.set(w, w, Math.max(0.01, len));
        m.material.uniforms.uTime.value = this.time;
        m.material.uniforms.uAlpha.value = Math.min(1, (1 - k) * 6, it.t * 12);
        if (Math.random() < 0.6) this.burst(b, it.hex, 3, 3, 0.3, 0.3);
        if (k >= 1) { this.scene.remove(m); m.material.dispose(); this.items.splice(i, 1); }
      } else if (it.type === 'decal') {
        it.u.uProgress.value = k;
        it.u.uTime.value = this.time;
        if (it.follow) { const p = it.follow(); if (p) it.u.uCenter.value.set(p.x, p.z); }
        if (k >= 1) { this.removeDecal(it); this.items.splice(i, 1); }
      } else if (it.type === 'fade') {
        it.mesh.material.opacity = it.base * (1 - k);
        it.mesh.scale.set(1 + k * it.grow, 1, 1 + k * it.grow);
        if (k >= 1) { this.scene.remove(it.mesh); it.mesh.geometry.dispose(); it.mesh.material.dispose(); this.items.splice(i, 1); }
      } else if (it.type === 'meteor') {
        tmp.lerpVectors(it.start, it.end, k * k);
        it.mesh.position.copy(tmp);
        const c = new THREE.Color(it.hex);
        for (let s = 0; s < 4; s++) this.add.spawn(tmp.x, tmp.y, tmp.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2 + 3, (Math.random() - 0.5) * 2, c.r * 3, c.g * 2, c.b, 1, 1.1, 0.6, 1, 0, 2);
        if (k >= 1) { this.explosion(it.end, 8, it.hex); this.shake(0.35); this.scene.remove(it.mesh); it.mesh.material.dispose(); this.items.splice(i, 1); }
      }
    }
    this.add.update(dt);
    this.smoke.update(dt);
    // floating text
    const w = this.gfx.renderer.domElement.clientWidth || window.innerWidth;
    for (const f of this.fct) {
      if (!f.alive) continue;
      f.t += dt;
      if (f.t > f.dur) { f.alive = false; f.d.style.display = 'none'; continue; }
      tmp.copy(f.pos).project(camera);
      if (tmp.z > 1) { f.d.style.display = 'none'; continue; }
      f.d.style.display = 'block';
      const x = (tmp.x * 0.5 + 0.5) * w + f.dx * (f.t / f.dur), y = (-tmp.y * 0.5 + 0.5) * h - f.t * 70;
      const pop = f.t < 0.12 ? 1 + (0.12 - f.t) * 6 : 1;
      f.d.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${pop})`;
      f.d.style.opacity = String(Math.min(1, (f.dur - f.t) * 3));
    }
  }

  _emit(e) {
    const r = e.radius || 0.3;
    const x = e.x + (Math.random() - 0.5) * r * 2, z = e.z + (Math.random() - 0.5) * r * 2;
    switch (e.type) {
      case 'fire': {
        const hot = Math.random();
        this.add.spawn(x, e.y, z, (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 0.4, 3 + hot, 1.2 + hot * 0.8, 0.3, 1, (e.size || 0.7) * (0.7 + Math.random() * 0.6), 0.5 + Math.random() * 0.4, 1.2, -1.2, 0.1);
        if (Math.random() < 0.15) this.add.spawn(x, e.y + 0.4, z, (Math.random() - 0.5), 2.5 + Math.random() * 2, (Math.random() - 0.5), 4, 2, 0.4, 1, 0.08, 1.5, 0.5, -0.4);
        break;
      }
      case 'smoke':
        this.smoke.spawn(x, e.y, z, 0.4 + Math.random() * 0.3, 1.2 + Math.random() * 0.8, 0.15, e.c || 0.3, e.c || 0.3, e.c || 0.32, 0.35, 1.5, 4 + Math.random() * 2, 0.3, -0.1, 5);
        break;
      case 'sparkle': {
        const c = e.color || [0.5, 1.5, 2.5];
        this.add.spawn(x, e.y + Math.random() * (e.h || 2), z, (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3, c[0], c[1], c[2], 1, e.size || 0.2, 1.5 + Math.random(), 0.3, 0);
        break;
      }
      case 'swirl': {
        const a = Math.random() * Math.PI * 2, rr = (e.radius || 4) * (0.5 + Math.random() * 0.5);
        const c = e.color || [0.6, 2, 3];
        this.add.spawn(e.x + Math.cos(a) * rr, e.y + Math.random() * (e.h || 20), e.z + Math.sin(a) * rr, -Math.sin(a) * 2, 1 + Math.random() * 3, Math.cos(a) * 2, c[0], c[1], c[2], 1, e.size || 0.5, 3, 0.2, -0.3);
        break;
      }
      case 'firefly': {
        const c = [1.6, 2.2, 0.6];
        this.add.spawn(x, e.y + Math.random() * 2, z, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5, c[0], c[1], c[2], 1, 0.12, 3 + Math.random() * 2, 0.05, 0);
        break;
      }
      default: break;
    }
  }
}
