// Shared GLSL snippets.
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s / 0.9375;
}
vec2 voronoi(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float md = 8.0, md2 = 8.0; float id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md2 = md; md = d; id = hash12(n + g); } else if (d < md2) { md2 = d; }
  }
  return vec2(sqrt(md2) - sqrt(md), id);
}
`;

export const GRASS_TINT_GLSL = /* glsl */ `
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uGrassC;
vec3 grassTint(vec2 wp) {
#ifdef TINT_LQ
  float n = vnoise(wp * 0.011);
#else
  float n = fbm2(wp * 0.011);
#endif
  float m = vnoise(wp * 0.045 + 3.7);
  vec3 c = mix(uGrassB, uGrassA, smoothstep(0.3, 0.7, n));
  c = mix(c, uGrassC, smoothstep(0.62, 0.92, m) * 0.55);
  return c;
}
`;

export const TERRAIN_HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uHeightTex;
uniform vec4 uWorld; // minX, minZ, size, cell
uniform float uRes;
float terrainH(vec2 wp) {
  vec2 g = (wp - uWorld.xy) / uWorld.w;
  g = clamp(g, vec2(0.0), vec2(uRes - 1.001));
  ivec2 i0 = ivec2(floor(g));
  vec2 f = fract(g);
  float a = texelFetch(uHeightTex, i0, 0).r;
  float b = texelFetch(uHeightTex, i0 + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeightTex, i0 + ivec2(0, 1), 0).r;
  float d = texelFetch(uHeightTex, i0 + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

// Inject back-lit translucency into the directional light loop of a lit material.
export function injectTranslucency(shader, strengthExpr = '0.8', power = '3.0') {
  const key = 'NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
  const src = shader.fragmentShader;
  shader.fragmentShader = src.replace('#include <lights_fragment_begin>', () => {
    return THREE_CHUNKS.lights_fragment_begin_patched(strengthExpr, power);
  });
  return key;
}

// Filled at runtime by gfx.js (needs THREE.ShaderChunk).
export const THREE_CHUNKS = {
  lights_fragment_begin_patched: null,
};

export function setupChunks(THREE) {
  const base = THREE.ShaderChunk.lights_fragment_begin;
  const marker = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
  const idx = base.indexOf(marker);
  const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const callIdx = base.indexOf(call, idx);
  THREE_CHUNKS.lights_fragment_begin_patched = (strength, power) => {
    if (idx < 0 || callIdx < 0) return base;
    const extra = `\n\t\t{ float bl = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), ${power} );\n\t\t  float wrapL = saturate( dot( -geometryNormal, directLight.direction ) * 0.5 + 0.5 );\n\t\t  reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * ( ${strength} ) * ( bl * 1.2 + wrapL * 0.25 ); }\n`;
    return base.slice(0, callIdx + call.length) + extra + base.slice(callIdx + call.length);
  };
}
