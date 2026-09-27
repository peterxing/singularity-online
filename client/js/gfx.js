import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { setupChunks } from './glsl.js';

const dpr = Math.min(window.devicePixelRatio || 1, 2);
export const QUALITY = {
  low: { label: 'Low', pixelRatio: Math.min(dpr, 1) * 0.75, shadow: 1024, shadowRange: 34, grassNear: 22000, grassFar: 12000, grassR: [15, 42], bloom: true, smaa: false, treeDist: 200, flowers: 1200, lights: 1, fogMul: 1.4, lq: true, envInterval: 40, plateRange: 0.6 },
  mobile: { label: 'Mobile', pixelRatio: Math.min(window.devicePixelRatio || 1, 1.35), shadow: 1024, shadowRange: 36, grassNear: 34000, grassFar: 18000, grassR: [17, 48], bloom: true, smaa: false, treeDist: 240, flowers: 2000, lights: 2, fogMul: 1.25, lq: true, envInterval: 30, plateRange: 0.7 },
  medium: { label: 'Medium', pixelRatio: Math.min(dpr, 1), shadow: 2048, shadowRange: 55, grassNear: 90000, grassFar: 70000, grassR: [24, 70], bloom: true, smaa: true, treeDist: 420, flowers: 6000, lights: 3, fogMul: 1, lq: false, envInterval: 6, plateRange: 1 },
  high: { label: 'High', pixelRatio: Math.min(dpr, 1.35), shadow: 4096, shadowRange: 65, grassNear: 150000, grassFar: 120000, grassR: [26, 85], bloom: true, smaa: true, treeDist: 560, flowers: 9000, lights: 4, fogMul: 1, lq: false, envInterval: 6, plateRange: 1 },
  ultra: { label: 'Ultra', pixelRatio: dpr, shadow: 4096, shadowRange: 80, grassNear: 230000, grassFar: 180000, grassR: [30, 100], bloom: true, smaa: true, treeDist: 700, flowers: 14000, lights: 4, fogMul: 1, lq: false, envInterval: 6, plateRange: 1 },
};
export const QUALITY_ORDER = ['low', 'mobile', 'medium', 'high', 'ultra'];

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.9 },
    uSat: { value: 1.12 },
    uContrast: { value: 1.06 },
    uWarm: { value: new THREE.Vector3(1.03, 1.0, 0.95) },
    uCool: { value: new THREE.Vector3(0.94, 0.99, 1.07) },
    uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uSat; uniform float uContrast;
    uniform vec3 uWarm; uniform vec3 uCool; uniform vec4 uFlash;
    varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5;
      float ca = dot(d, d) * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + d * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - d * ca).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col *= mix(uCool, uWarm, smoothstep(0.1, 0.8, l));
      float v = 1.0 - dot(d, d) * uVignette;
      col *= clamp(v, 0.0, 1.0);
      col = mix(col, uFlash.rgb, uFlash.a * smoothstep(0.1, 0.7, length(d) * 1.3));
      col += (fract(sin(dot(vUv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 180.0;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Gfx {
  constructor(canvas) {
    setupChunks(THREE);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.15, 6000);
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.qualityKey = 'high';
    this.q = QUALITY.high;
    this.bloomOn = true;
    this._buildComposer();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _buildComposer() {
    const r = this.renderer;
    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.42, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
  }

  setQuality(key) {
    this.qualityKey = QUALITY[key] ? key : 'high';
    this.q = QUALITY[this.qualityKey];
    this.smaa.enabled = this.q.smaa;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === this._w && h === this._h && this._pr === this.q.pixelRatio) return;
    this._w = w; this._h = h; this._pr = this.q.pixelRatio;
    this.renderer.setPixelRatio(this.q.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.q.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? Math.min(76, 58 + (1 - w / h) * 40) : 58;
    this.camera.updateProjectionMatrix();
  }

  render(time) {
    this.grade.uniforms.uTime.value = time % 100;
    this.bloom.enabled = this.bloomOn;
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.composer.render();
  }
}
