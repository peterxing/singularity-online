import * as THREE from 'three';
import { mulberry32 } from '../shared/rng.js';

// Procedural canvas textures (no image assets anywhere).
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function periodicNoise(seed) {
  const rand = mulberry32(seed);
  const P = 64;
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (x, y) => g[(((y % P) + P) % P) * P + (((x % P) + P) % P)];
  return (x, y, period) => {
    const s = P / period;
    x *= s; y *= s;
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const px = Math.round(period * s);
    const w = (a) => ((a % px) + px) % px;
    const a = at(w(xi), w(yi)), b = at(w(xi + 1), w(yi)), c = at(w(xi), w(yi + 1)), d = at(w(xi + 1), w(yi + 1));
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function toTexture(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function normalFromHeight(hdata, w, h, strength = 2.0) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const H = (x, y) => hdata[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

// ------------------------------------------------------------------ foliage
export function leafClusterTexture() {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const rand = mulberry32(42);
  ctx.clearRect(0, 0, S, S);
  const leaf = (x, y, len, wid, ang, shade) => {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, -wid, 0, wid);
    const v = Math.round(150 + shade * 105);
    g.addColorStop(0, `rgb(${v},${v},${v})`);
    g.addColorStop(1, `rgb(${v * 0.72 | 0},${v * 0.72 | 0},${v * 0.72 | 0})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, 0);
    ctx.quadraticCurveTo(0, -wid, len * 0.5, 0);
    ctx.quadraticCurveTo(0, wid, -len * 0.5, 0);
    ctx.fill();
    ctx.strokeStyle = `rgba(60,60,60,0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-len * 0.45, 0); ctx.lineTo(len * 0.45, 0); ctx.stroke();
    ctx.restore();
  };
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * S * 0.38;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    const len = 34 + rand() * 30;
    leaf(x, y, len, len * 0.32, a + (rand() - 0.5) * 1.2, 0.35 + (1 - r / (S * 0.4)) * 0.65 * rand());
  }
  return toTexture(c, { repeat: false });
}

export function barkTexture() {
  const W = 256, H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const n = periodicNoise(7);
  const hd = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const streak = n(x * 4, y * 0.35, 64) * 0.6 + n(x * 9, y * 0.8, 64) * 0.3 + n(x, y, 32) * 0.3;
      const v = Math.pow(streak, 1.4);
      hd[y * W + x] = v;
      const i = (y * W + x) * 4;
      img.data[i] = 90 + v * 110; img.data[i + 1] = 68 + v * 80; img.data[i + 2] = 50 + v * 55; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c), normalMap: normalFromHeight(hd, W, H, 3.0) };
}

// ------------------------------------------------------------------ architecture
export function stoneBlockTexture(seed = 3, opts = {}) {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const rand = mulberry32(seed);
  const n = periodicNoise(seed + 11);
  const hd = new Float32Array(S * S);
  const rows = opts.rows || 8;
  const rh = S / rows;
  const base = opts.base || [205, 198, 186];
  const img = ctx.createImageData(S, S);
  // block id map
  const blockShade = new Float32Array(S * S);
  const mortar = new Float32Array(S * S);
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 60;
    while (x < S) {
      const w = 50 + rand() * 70;
      const shade = 0.82 + rand() * 0.3;
      for (let y = Math.floor(r * rh); y < Math.floor((r + 1) * rh); y++) {
        for (let xx = Math.floor(x); xx < Math.floor(x + w); xx++) {
          const px = ((xx % S) + S) % S;
          blockShade[y * S + px] = shade;
          const dx = Math.min(xx - x, x + w - xx), dy = Math.min(y - r * rh, (r + 1) * rh - y);
          mortar[y * S + px] = Math.min(dx, dy);
        }
      }
      x += w;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const nn = n(x, y, 64) * 0.5 + n(x * 2, y * 2, 64) * 0.3 + n(x * 6, y * 6, 64) * 0.2;
      const m = Math.min(1, mortar[k] / 4.5);
      const edge = Math.min(1, mortar[k] / 12);
      const h = m * (0.7 + 0.3 * edge) * (0.85 + nn * 0.3);
      hd[k] = h;
      const shade = blockShade[k] * (0.8 + nn * 0.35) * (0.55 + 0.45 * m) * (0.85 + 0.15 * edge);
      const i = k * 4;
      img.data[i] = Math.min(255, base[0] * shade); img.data[i + 1] = Math.min(255, base[1] * shade); img.data[i + 2] = Math.min(255, base[2] * shade);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c), normalMap: normalFromHeight(hd, S, S, 4.0) };
}

export function roofTileTexture(seed = 5) {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const n = periodicNoise(seed);
  const rand = mulberry32(seed);
  const rows = 10, cols = 8;
  const rh = S / rows, cw = S / cols;
  const shades = [];
  for (let i = 0; i < rows * cols * 2; i++) shades.push(0.8 + rand() * 0.35);
  const hd = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const r = Math.floor(y / rh);
    const fy = (y - r * rh) / rh;
    for (let x = 0; x < S; x++) {
      const off = (r % 2) * cw * 0.5;
      const cx = Math.floor(((x + off) % S) / cw);
      const fx = (((x + off) % S) - cx * cw) / cw;
      const round = Math.sqrt(Math.max(0, 1 - Math.pow((fx - 0.5) * 2, 2)));
      const lip = 1 - Math.pow(fy, 3);
      const h = round * (0.4 + 0.6 * fy) * (fy < 0.94 ? 1 : 0.2);
      hd[y * S + x] = h;
      const nn = n(x * 2, y * 2, 64) * 0.2 + 0.9;
      const s = shades[(r * cols + cx) % shades.length] * (0.45 + 0.55 * round) * (0.55 + 0.45 * fy) * nn * (0.8 + 0.2 * lip);
      const i = (y * S + x) * 4;
      const v = Math.min(255, 235 * s);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c), normalMap: normalFromHeight(hd, S, S, 5.0) };
}

export function plankTexture(seed = 9) {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const n = periodicNoise(seed);
  const rand = mulberry32(seed);
  const planks = 6, pw = S / planks;
  const shade = Array.from({ length: planks }, () => 0.75 + rand() * 0.35);
  const hd = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = Math.floor(x / pw);
      const fx = (x - p * pw) / pw;
      const grain = n(x * 6, y * 0.4, 64) * 0.6 + n(x * 14, y, 64) * 0.4;
      const seam = Math.min(fx, 1 - fx) < 0.04 ? 0.45 : 1;
      const h = seam < 1 ? 0 : 0.7 + grain * 0.3;
      hd[y * S + x] = h;
      const s = shade[p] * (0.7 + grain * 0.45) * seam;
      const i = (y * S + x) * 4;
      img.data[i] = Math.min(255, 175 * s); img.data[i + 1] = Math.min(255, 128 * s); img.data[i + 2] = Math.min(255, 82 * s); img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c), normalMap: normalFromHeight(hd, S, S, 3.0) };
}

export function plasterTexture(seed = 13) {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const n = periodicNoise(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = 0.82 + n(x, y, 32) * 0.12 + n(x * 4, y * 4, 64) * 0.08;
    const i = (y * S + x) * 4;
    img.data[i] = 240 * v; img.data[i + 1] = 232 * v; img.data[i + 2] = 215 * v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

export function metalPanelTexture(seed = 17) {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const n = periodicNoise(seed);
  const hd = new Float32Array(S * S);
  const P = 128;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x % P, fy = y % (P / 2);
    const seam = fx < 3 || fy < 3 ? 0 : 1;
    const rivet = ((fx - 10) ** 2 + (fy - 10) ** 2 < 16 || (fx - (P - 10)) ** 2 + (fy - 10) ** 2 < 16) ? 1 : 0;
    const scratches = n(x * 8, y * 0.5, 64) * 0.15;
    const h = seam * 0.6 + rivet * 0.4;
    hd[y * S + x] = h;
    const v = (0.72 + scratches + n(x, y, 16) * 0.1) * (seam ? 1 : 0.55) + rivet * 0.2;
    const i = (y * S + x) * 4;
    img.data[i] = 200 * v; img.data[i + 1] = 202 * v; img.data[i + 2] = 206 * v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c), normalMap: normalFromHeight(hd, S, S, 3.0) };
}

export function marbleTexture(seed = 21) {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const n = periodicNoise(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = n(x, y, 16) * 3 + n(x * 2, y * 2, 32) * 1.5;
    const vein = Math.pow(Math.abs(Math.sin((x / S) * Math.PI * 4 + t * 2.5)), 0.25);
    const v = 0.78 + vein * 0.2 + n(x * 4, y * 4, 64) * 0.04;
    const i = (y * S + x) * 4;
    img.data[i] = 248 * v; img.data[i + 1] = 246 * v; img.data[i + 2] = 240 * v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

// ------------------------------------------------------------------ emblems & banners
export function drawEmblem(ctx, faction, cx, cy, r, color = '#fff') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = r * 0.09;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  if (faction === 'eacc') {
    // gear teeth + upward flame-arrow
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.save(); ctx.rotate(a);
      ctx.fillRect(-r * 0.08, -r * 1.18, r * 0.16, r * 0.2);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.78);
    ctx.bezierCurveTo(r * 0.55, -r * 0.2, r * 0.45, r * 0.35, r * 0.18, r * 0.62);
    ctx.lineTo(r * 0.18, r * 0.1);
    ctx.lineTo(0, r * 0.3);
    ctx.lineTo(-r * 0.18, r * 0.1);
    ctx.lineTo(-r * 0.18, r * 0.62);
    ctx.bezierCurveTo(-r * 0.45, r * 0.35, -r * 0.55, -r * 0.2, 0, -r * 0.78);
    ctx.fill();
  } else {
    // eight-point lodestar inside laurel arcs
    const star = (R, rr, pts) => {
      ctx.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 ? rr : R;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath(); ctx.fill();
    };
    star(r * 0.72, r * 0.16, 4);
    ctx.globalAlpha = 0.75; star(r * 0.45, r * 0.12, 8); ctx.globalAlpha = 1;
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 + s * (0.5 + i * 0.32);
        ctx.save();
        ctx.translate(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
        ctx.rotate(a + s * 0.6);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.1, r * 0.045, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

export function bannerTexture(faction) {
  const W = 256, H = 640;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const main = faction === 'eacc' ? ['#a3380f', '#e0661c'] : ['#0f3f7a', '#2c7fd0'];
  const trim = faction === 'eacc' ? '#ffcf6a' : '#e8f4ff';
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, main[1]); g.addColorStop(1, main[0]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H * 0.86); ctx.lineTo(W / 2, H); ctx.lineTo(0, H * 0.86); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = trim; ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(14, 8); ctx.lineTo(W - 14, 8); ctx.lineTo(W - 14, H * 0.85); ctx.lineTo(W / 2, H - 16); ctx.lineTo(14, H * 0.85); ctx.closePath();
  ctx.stroke();
  // woven noise
  const img = ctx.getImageData(0, 0, W, H);
  const rand = mulberry32(faction === 'eacc' ? 1 : 2);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const y = Math.floor(i / 4 / W);
    const f = 0.9 + rand() * 0.12 + (y % 4 === 0 ? -0.05 : 0);
    img.data[i] *= f; img.data[i + 1] *= f; img.data[i + 2] *= f;
  }
  ctx.putImageData(img, 0, 0);
  drawEmblem(ctx, faction, W / 2, H * 0.38, 72, trim);
  ctx.fillStyle = trim;
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(faction === 'eacc' ? 'e/acc' : 'ALIGNED', W / 2, H * 0.66);
  const t = toTexture(c, { repeat: false });
  return t;
}

export function signTexture(lines) {
  const W = 512, H = 128;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b4a2b'; ctx.fillRect(0, 0, W, H);
  const rand = mulberry32(lines.join('').length);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(40,25,10,${0.15 + rand() * 0.2})`;
    ctx.beginPath(); const y = rand() * H; ctx.moveTo(0, y); ctx.bezierCurveTo(W / 3, y + rand() * 8 - 4, (2 * W) / 3, y + rand() * 8 - 4, W, y); ctx.stroke();
  }
  ctx.strokeStyle = '#3a2512'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.fillStyle = '#f7e6c1';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText(lines[0], W / 2, H / 2 + 2);
  return toTexture(c, { repeat: false });
}

export function markerTexture(ch, color = '#ffd21f') {
  const S = 128;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.font = 'bold 110px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 12; ctx.strokeStyle = '#2a1600';
  ctx.strokeText(ch, S / 2, S / 2 + 6);
  const g = ctx.createLinearGradient(0, 10, 0, S - 10);
  g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, color); g.addColorStop(1, '#c47a00');
  ctx.fillStyle = g;
  ctx.fillText(ch, S / 2, S / 2 + 6);
  return toTexture(c, { repeat: false });
}

export function starTexture() {
  const S = 64;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  ctx.fillStyle = '#fff3a0';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 10 : 28;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  return toTexture(c, { repeat: false });
}

export function textSpriteTexture(text, color = '#e0b3ff') {
  const W = 256, H = 64;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, H / 2);
  return toTexture(c, { repeat: false });
}

export function rackTexture() {
  const W = 128, H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#15181f'; ctx.fillRect(0, 0, W, H);
  for (let y = 8; y < H; y += 16) {
    ctx.fillStyle = '#232833'; ctx.fillRect(6, y, W - 12, 12);
    for (let x = 12; x < W - 12; x += 10) {
      ctx.fillStyle = Math.random() > 0.4 ? '#39ffb0' : '#1a6cff';
      ctx.fillRect(x, y + 4, 4, 4);
    }
  }
  return toTexture(c, { repeat: false });
}
