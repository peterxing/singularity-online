// Procedurally painted ability/buff icons (canvas → data URL). No image assets.
const cache = new Map();

function hexToRgb(h) {
  const n = typeof h === 'number' ? h : parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const GLYPHS = {
  rocket(c) { c.beginPath(); c.moveTo(32, 8); c.bezierCurveTo(42, 16, 42, 34, 38, 44); c.lineTo(26, 44); c.bezierCurveTo(22, 34, 22, 16, 32, 8); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(26, 36); c.lineTo(18, 48); c.lineTo(26, 45); c.moveTo(38, 36); c.lineTo(46, 48); c.lineTo(38, 45); c.fill(); c.stroke();
    c.fillStyle = '#ffcf5a'; c.beginPath(); c.moveTo(28, 46); c.lineTo(32, 58); c.lineTo(36, 46); c.fill();
    c.fillStyle = '#3a8aff'; c.beginPath(); c.arc(32, 24, 4, 0, 7); c.fill(); },
  flame(c) { c.beginPath(); c.moveTo(32, 6); c.bezierCurveTo(46, 22, 52, 34, 44, 48); c.bezierCurveTo(40, 56, 24, 56, 20, 48); c.bezierCurveTo(14, 36, 22, 28, 26, 20); c.bezierCurveTo(28, 28, 30, 30, 32, 30); c.bezierCurveTo(30, 22, 30, 14, 32, 6); c.fill(); c.stroke();
    c.fillStyle = '#fff6b0'; c.beginPath(); c.moveTo(32, 30); c.bezierCurveTo(40, 38, 40, 50, 32, 52); c.bezierCurveTo(24, 50, 26, 40, 32, 30); c.fill(); },
  dash(c) { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(12 + i * 12, 16); c.lineTo(26 + i * 12, 32); c.lineTo(12 + i * 12, 48); c.lineTo(18 + i * 12, 48); c.lineTo(32 + i * 12, 32); c.lineTo(18 + i * 12, 16); c.closePath(); c.globalAlpha = 0.5 + i * 0.25; c.fill(); c.stroke(); } c.globalAlpha = 1; },
  brain(c) { c.beginPath(); c.arc(24, 30, 12, Math.PI * 0.6, Math.PI * 1.9); c.arc(40, 30, 12, Math.PI * 1.1, Math.PI * 0.4); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(32, 18); c.lineTo(32, 44); c.moveTo(22, 28); c.quadraticCurveTo(27, 32, 22, 36); c.moveTo(42, 28); c.quadraticCurveTo(37, 32, 42, 36); c.stroke();
    c.strokeStyle = '#7affd4'; c.beginPath(); c.moveTo(32, 44); c.lineTo(32, 56); c.lineTo(24, 56); c.moveTo(32, 50); c.lineTo(42, 50); c.stroke(); },
  planet(c) { c.beginPath(); c.arc(32, 32, 16, 0, 7); c.fill(); c.stroke(); c.fillStyle = 'rgba(120,30,10,0.6)'; c.beginPath(); c.arc(26, 28, 4, 0, 7); c.arc(38, 38, 3, 0, 7); c.fill();
    c.strokeStyle = '#ffd9a0'; c.lineWidth = 3; c.beginPath(); c.ellipse(32, 32, 26, 8, -0.4, 0, 7); c.stroke(); },
  fist(c) { c.beginPath(); c.roundRect(18, 18, 28, 26, 6); c.fill(); c.stroke(); for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(25 + i * 7, 18); c.lineTo(25 + i * 7, 30); c.stroke(); }
    c.beginPath(); c.roundRect(22, 44, 20, 12, 3); c.fill(); c.stroke(); c.strokeStyle = '#ffe07a'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(10, 16 + i * 10); c.lineTo(4, 14 + i * 10); c.stroke(); } },
  haste(c) { c.beginPath(); c.moveTo(36, 6); c.lineTo(18, 34); c.lineTo(30, 34); c.lineTo(26, 58); c.lineTo(46, 26); c.lineTo(34, 26); c.closePath(); c.fill(); c.stroke(); },
  slam(c) { c.beginPath(); c.moveTo(32, 10); c.lineTo(38, 30); c.lineTo(26, 30); c.closePath(); c.fill(); c.stroke(); c.lineWidth = 3;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(32, 44, 8 + i * 8, 3 + i * 3, 0, 0, 7); c.stroke(); } },
  charge(c) { c.beginPath(); c.moveTo(10, 38); c.lineTo(40, 38); c.lineTo(40, 48); c.lineTo(56, 32); c.lineTo(40, 16); c.lineTo(40, 26); c.lineTo(10, 26); c.closePath(); c.fill(); c.stroke(); },
  sun(c) { c.beginPath(); c.arc(32, 32, 11, 0, 7); c.fill(); c.stroke(); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15); c.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); c.stroke(); } },
  bolt(c) { c.beginPath(); c.moveTo(38, 6); c.lineTo(16, 36); c.lineTo(30, 36); c.lineTo(24, 58); c.lineTo(48, 26); c.lineTo(34, 26); c.closePath(); c.fill(); c.stroke(); },
  ship(c) { c.beginPath(); c.moveTo(10, 38); c.lineTo(54, 38); c.lineTo(46, 50); c.lineTo(18, 50); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.roundRect(20, 24, 12, 14, 2); c.roundRect(33, 18, 12, 20, 2); c.fill(); c.stroke();
    c.strokeStyle = '#bff'; c.beginPath(); c.moveTo(8, 56); c.quadraticCurveTo(20, 52, 32, 56); c.quadraticCurveTo(44, 60, 56, 56); c.stroke(); },
  cluster(c) { for (let i = 0; i < 3; i++) { c.beginPath(); c.roundRect(12 + i * 14, 14, 11, 38, 2); c.fill(); c.stroke(); c.fillStyle = '#39ffb0'; for (let j = 0; j < 5; j++) c.fillRect(15 + i * 14, 18 + j * 7, 5, 2); c.fillStyle = '#e8f6ff'; } },
  orb(c) { const g = c.createRadialGradient(26, 24, 2, 32, 32, 18); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#b8c8dc'); g.addColorStop(1, '#4a5a70'); c.fillStyle = g; c.beginPath(); c.arc(32, 32, 17, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#10161e'; c.beginPath(); c.arc(32, 32, 7, 0, 7); c.fill(); c.fillStyle = '#8fe3ff'; c.beginPath(); c.arc(32, 32, 3.5, 0, 7); c.fill(); },
  beam(c) { c.beginPath(); c.moveTo(8, 50); c.lineTo(50, 8); c.lineTo(56, 14); c.lineTo(14, 56); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(50, 14, 6, 0, 7); c.fill();
    c.strokeStyle = '#fff'; c.beginPath(); c.arc(32, 32, 20, 0, 7); c.stroke(); },
  jaws(c) { c.beginPath(); c.arc(32, 32, 20, 0.35, Math.PI * 2 - 0.35); c.lineTo(32, 32); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#222'; c.beginPath(); c.arc(30, 22, 3, 0, 7); c.fill();
    c.fillStyle = '#7fd0ff'; c.fillRect(48, 28, 5, 5); c.fillRect(55, 33, 4, 4); },
  book(c) { c.beginPath(); c.moveTo(32, 16); c.quadraticCurveTo(22, 10, 8, 14); c.lineTo(8, 50); c.quadraticCurveTo(22, 46, 32, 52); c.quadraticCurveTo(42, 46, 56, 50); c.lineTo(56, 14); c.quadraticCurveTo(42, 10, 32, 16); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(32, 16); c.lineTo(32, 52); c.stroke(); c.lineWidth = 1.5; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(13, 22 + i * 6); c.lineTo(27, 23 + i * 6); c.moveTo(37, 23 + i * 6); c.lineTo(51, 22 + i * 6); c.stroke(); } },
  turret(c) { c.beginPath(); c.moveTo(18, 56); c.lineTo(26, 36); c.lineTo(38, 36); c.lineTo(46, 56); c.fill(); c.stroke(); c.beginPath(); c.roundRect(20, 22, 24, 16, 4); c.fill(); c.stroke(); c.beginPath(); c.rect(40, 26, 18, 6); c.fill(); c.stroke();
    c.fillStyle = '#ff9a2a'; c.beginPath(); c.arc(30, 30, 3, 0, 7); c.fill(); },
  shield(c) { c.beginPath(); c.moveTo(32, 8); c.lineTo(52, 16); c.quadraticCurveTo(52, 44, 32, 58); c.quadraticCurveTo(12, 44, 12, 16); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(32, 14); c.lineTo(32, 50); c.moveTo(18, 26); c.lineTo(46, 26); c.stroke(); },
  hammer(c) { c.beginPath(); c.rect(29, 24, 6, 34); c.fill(); c.stroke(); c.beginPath(); c.roundRect(12, 10, 40, 16, 3); c.fill(); c.stroke(); c.fillStyle = '#ffd76b'; c.fillRect(12, 16, 40, 4); },
  scroll(c) { c.beginPath(); c.roundRect(16, 12, 32, 40, 3); c.fill(); c.stroke(); c.beginPath(); c.ellipse(32, 12, 18, 4, 0, 0, 7); c.ellipse(32, 52, 18, 4, 0, 0, 7); c.fill(); c.stroke(); c.lineWidth = 1.5; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(21, 20 + i * 6); c.lineTo(43, 20 + i * 6); c.stroke(); } },
  scale(c) { c.beginPath(); c.moveTo(32, 10); c.lineTo(32, 52); c.moveTo(12, 18); c.lineTo(52, 18); c.stroke(); c.beginPath(); c.moveTo(22, 52); c.lineTo(42, 52); c.lineTo(32, 46); c.closePath(); c.fill(); c.stroke();
    for (const x of [16, 48]) { c.beginPath(); c.moveTo(x - 9, 34); c.quadraticCurveTo(x, 44, x + 9, 34); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(x, 18); c.lineTo(x - 8, 34); c.moveTo(x, 18); c.lineTo(x + 8, 34); c.stroke(); } },
  eye(c) { c.beginPath(); c.moveTo(6, 32); c.quadraticCurveTo(32, 8, 58, 32); c.quadraticCurveTo(32, 56, 6, 32); c.fill(); c.stroke(); c.fillStyle = '#0a3a4a'; c.beginPath(); c.arc(32, 32, 10, 0, 7); c.fill(); c.fillStyle = '#7ff0ff'; c.beginPath(); c.arc(32, 32, 5, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(29, 29, 2, 0, 7); c.fill(); },
  heart(c) { c.beginPath(); c.moveTo(32, 54); c.bezierCurveTo(6, 36, 10, 12, 24, 14); c.bezierCurveTo(30, 15, 32, 20, 32, 22); c.bezierCurveTo(32, 20, 34, 15, 40, 14); c.bezierCurveTo(54, 12, 58, 36, 32, 54); c.fill(); c.stroke();
    c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(22, 32); c.lineTo(28, 32); c.lineTo(31, 26); c.lineTo(35, 38); c.lineTo(38, 32); c.lineTo(44, 32); c.stroke(); },
  podium(c) { c.beginPath(); c.rect(24, 22, 16, 34); c.rect(8, 34, 16, 22); c.rect(40, 40, 16, 16); c.fill(); c.stroke(); c.fillStyle = '#ffe07a'; c.beginPath(); c.moveTo(32, 6); c.lineTo(35, 13); c.lineTo(42, 13); c.lineTo(36, 17); c.lineTo(38, 24); c.lineTo(32, 19); c.lineTo(26, 24); c.lineTo(28, 17); c.lineTo(22, 13); c.lineTo(29, 13); c.closePath(); c.fill(); },
  prob(c) { c.font = 'bold 34px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('P(x)', 32, 30); c.fillText('P(x)', 32, 30); c.lineWidth = 2; c.beginPath(); c.moveTo(8, 54); c.bezierCurveTo(24, 54, 26, 40, 32, 40); c.bezierCurveTo(38, 40, 40, 54, 56, 54); c.stroke(); },
  curse(c) { for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(32, 32, 8 + i * 8, i, i + 4.4); c.stroke(); } c.beginPath(); c.arc(32, 32, 5, 0, 7); c.fill(); },
  stop(c) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; c.lineTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24); } c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('STOP', 32, 33); },
  medal(c) { c.beginPath(); c.moveTo(22, 6); c.lineTo(30, 26); c.lineTo(34, 26); c.lineTo(42, 6); c.fill(); c.stroke(); c.beginPath(); c.arc(32, 40, 15, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.font = 'bold 16px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+1', 32, 41); },
  nova(c) { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const r = i % 2 ? 14 : 27; c.beginPath(); c.moveTo(32, 32); c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); c.lineTo(32 + Math.cos(a + 0.2) * r * 0.5, 32 + Math.sin(a + 0.2) * r * 0.5); c.fill(); } c.beginPath(); c.arc(32, 32, 9, 0, 7); c.fill(); c.stroke(); },
  circle(c) { c.lineWidth = 4; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(32, 32, 8 + i * 8, 0, 7); c.globalAlpha = 1 - i * 0.25; c.stroke(); } c.globalAlpha = 1; GLYPHS.heartSmall(c); },
  heartSmall(c) { c.beginPath(); c.moveTo(32, 40); c.bezierCurveTo(22, 32, 24, 24, 29, 25); c.bezierCurveTo(31, 25, 32, 27, 32, 28); c.bezierCurveTo(32, 27, 33, 25, 35, 25); c.bezierCurveTo(40, 24, 42, 32, 32, 40); c.fill(); },
  coin(c) { c.beginPath(); c.arc(32, 32, 20, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(32, 32, 14, 0, 7); c.stroke(); c.fillStyle = '#6a4a00'; c.font = 'bold 22px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 32, 33); },
  net(c) { c.lineWidth = 2; c.beginPath(); c.moveTo(10, 50); c.quadraticCurveTo(32, 2, 54, 50); c.stroke(); for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(14 + i * 9, 50); c.lineTo(22 + i * 5, 14); c.stroke(); } for (let j = 0; j < 4; j++) { c.beginPath(); c.moveTo(12 + j * 2, 42 - j * 8); c.lineTo(52 - j * 2, 42 - j * 8); c.stroke(); } c.beginPath(); c.moveTo(8, 50); c.lineTo(56, 50); c.stroke(); },
  hourglass(c) { c.beginPath(); c.moveTo(16, 8); c.lineTo(48, 8); c.lineTo(34, 32); c.lineTo(48, 56); c.lineTo(16, 56); c.lineTo(30, 32); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#ffe07a'; c.beginPath(); c.moveTo(22, 52); c.lineTo(42, 52); c.lineTo(32, 42); c.fill(); },
  star(c) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? 10 : 24; c.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke(); },
  axes(c) { c.lineWidth = 4; c.beginPath(); c.moveTo(12, 52); c.lineTo(52, 52); c.moveTo(12, 52); c.lineTo(12, 12); c.stroke(); c.lineWidth = 2; c.beginPath(); c.moveTo(12, 52); c.lineTo(44, 18); c.stroke(); c.beginPath(); c.arc(44, 18, 5, 0, 7); c.fill(); c.stroke(); },
  paperclip(c) { c.lineWidth = 4; c.beginPath(); c.moveTo(38, 18); c.lineTo(38, 44); c.arc(32, 44, 6, 0, Math.PI); c.lineTo(26, 14); c.arc(33, 14, 7, Math.PI, 0); c.lineTo(40, 48); c.arc(31, 48, 9, 0, Math.PI); c.lineTo(22, 20); c.stroke(); },
  cube(c) { c.beginPath(); c.moveTo(32, 8); c.lineTo(54, 20); c.lineTo(54, 44); c.lineTo(32, 56); c.lineTo(10, 44); c.lineTo(10, 20); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(10, 20); c.lineTo(32, 32); c.lineTo(54, 20); c.moveTo(32, 32); c.lineTo(32, 56); c.stroke(); },
  bomb(c) { c.beginPath(); c.arc(30, 36, 18, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.rect(36, 14, 8, 8); c.fill(); c.stroke(); c.strokeStyle = '#ffcf5a'; c.beginPath(); c.moveTo(44, 16); c.quadraticCurveTo(52, 8, 56, 12); c.stroke(); c.fillStyle = '#ffe07a'; c.beginPath(); c.arc(57, 11, 4, 0, 7); c.fill(); },
  crown(c) { c.beginPath(); c.moveTo(10, 46); c.lineTo(10, 20); c.lineTo(22, 32); c.lineTo(32, 14); c.lineTo(42, 32); c.lineTo(54, 20); c.lineTo(54, 46); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.rect(10, 46, 44, 8); c.fill(); c.stroke(); },
  potion(c) { c.beginPath(); c.moveTo(26, 8); c.lineTo(38, 8); c.lineTo(38, 22); c.quadraticCurveTo(52, 30, 50, 44); c.quadraticCurveTo(48, 58, 32, 58); c.quadraticCurveTo(16, 58, 14, 44); c.quadraticCurveTo(12, 30, 26, 22); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(24, 40, 3, 8, 0.3, 0, 7); c.fill(); },
  chip(c) { c.beginPath(); c.roundRect(16, 16, 32, 32, 3); c.fill(); c.stroke(); c.lineWidth = 2; for (let i = 0; i < 4; i++) { const p = 21 + i * 7.5; c.beginPath(); c.moveTo(p, 8); c.lineTo(p, 16); c.moveTo(p, 48); c.lineTo(p, 56); c.moveTo(8, p); c.lineTo(16, p); c.moveTo(48, p); c.lineTo(56, p); c.stroke(); } },
  wheat(c) { c.lineWidth = 2.5; c.beginPath(); c.moveTo(32, 58); c.lineTo(32, 10); c.stroke(); for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(26, 14 + i * 8, 5, 3, -0.6, 0, 7); c.ellipse(38, 14 + i * 8, 5, 3, 0.6, 0, 7); c.fill(); c.stroke(); } },
  stun(c) { GLYPHS.star(c); },
  slow(c) { c.beginPath(); c.arc(32, 36, 16, Math.PI, 0); c.lineTo(48, 44); c.lineTo(16, 44); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.arc(50, 40, 5, 0, 7); c.fill(); c.stroke(); },
  default(c) { GLYPHS.star(c); },
};

export function icon(key, color = 0x8888ff, size = 64) {
  const k = `${key}|${color}|${size}`;
  if (cache.has(k)) return cache.get(k);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.scale(size / 64, size / 64);
  const [r, g, b] = hexToRgb(color);
  const bg = c.createRadialGradient(24, 20, 4, 32, 32, 46);
  bg.addColorStop(0, `rgb(${Math.min(255, r * 0.9 + 40)},${Math.min(255, g * 0.9 + 40)},${Math.min(255, b * 0.9 + 40)})`);
  bg.addColorStop(0.55, `rgb(${r * 0.45 | 0},${g * 0.45 | 0},${b * 0.45 | 0})`);
  bg.addColorStop(1, `rgb(${r * 0.12 | 0},${g * 0.12 | 0},${b * 0.12 | 0})`);
  c.fillStyle = bg;
  c.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; c.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
  c.save();
  c.shadowColor = `rgba(${r},${g},${b},0.9)`;
  c.shadowBlur = 8;
  const fg = c.createLinearGradient(0, 8, 0, 56);
  fg.addColorStop(0, '#ffffff');
  fg.addColorStop(1, `rgb(${Math.min(255, r * 0.5 + 140)},${Math.min(255, g * 0.5 + 140)},${Math.min(255, b * 0.5 + 140)})`);
  c.fillStyle = fg;
  c.strokeStyle = 'rgba(10,8,20,0.85)';
  c.lineWidth = 2;
  c.lineJoin = 'round';
  (GLYPHS[key] || GLYPHS.default)(c);
  c.restore();
  const vg = c.createRadialGradient(32, 32, 20, 32, 32, 46);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = vg;
  c.fillRect(0, 0, 64, 64);
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth = 2;
  c.strokeRect(1, 1, 62, 62);
  const url = cv.toDataURL();
  cache.set(k, url);
  return url;
}
