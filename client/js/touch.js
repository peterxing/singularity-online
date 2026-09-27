// Mobile / touch input: dynamic virtual joystick, drag-to-look, pinch-zoom, tap actions and thumb buttons.
export function isTouchDevice() {
  const p = new URLSearchParams(location.search);
  if (p.has('touch')) return true;
  if (p.has('desktop')) return false;
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const ua = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return coarse || ua;
}

export function canFullscreen() {
  const d = document.documentElement;
  return !!(document.fullscreenEnabled && d.requestFullscreen) || !!d.webkitRequestFullscreen;
}

export async function toggleFullscreen() {
  const d = document.documentElement;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }
    if (d.requestFullscreen) await d.requestFullscreen({ navigationUI: 'hide' });
    else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen();
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
  } catch { /* not supported */ }
}

const ICONS = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 3 4 12h5v8h6v-8h5z" fill="currentColor"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="currentColor" stroke-width="2"/></svg>',
  use: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 7v4M12 13v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M3 5h18v11H8l-5 4z" fill="currentColor"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
};

export class TouchControls {
  constructor(game) {
    this.g = game;
    this.move = { x: 0, y: 0, mag: 0, active: false };
    this.root = document.getElementById('touch');
    this.root.classList.remove('hidden');
    this.stick = document.getElementById('tStick');
    this.knob = document.getElementById('tKnob');
    this.pointers = new Map();
    this.stickId = null;
    this.stickOrigin = null;
    this.pinch = null;
    for (const [id, ic] of [['tJump', 'jump'], ['tTarget', 'target'], ['tUse', 'use'], ['tChat', 'chat'], ['tFull', 'full']]) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = ICONS[ic];
    }
    if (!canFullscreen()) document.getElementById('tFull').classList.add('hidden');
    const menu = document.querySelector('.menu-btns');
    if (menu) for (const id of ['tChat', 'tFull']) { const b = document.getElementById(id); if (b) menu.appendChild(b); }
    this._bindCanvas();
    this._bindButtons();
  }

  _camPointers() { return [...this.pointers.values()].filter((p) => p.role === 'cam'); }

  _bindCanvas() {
    const el = document.getElementById('game');
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
    window.addEventListener('pointermove', (e) => this._moveEv(e), { passive: false });
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
  }

  _down(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const w = window.innerWidth, h = window.innerHeight;
    const leftZone = e.clientX < w * 0.45 && e.clientY > h * 0.3;
    if (leftZone && this.stickId === null && this.g.ctrl.enabled) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.add('on');
      this.stick.classList.remove('idle');
      this.pointers.set(e.pointerId, { role: 'stick' });
      return;
    }
    this.pointers.set(e.pointerId, { role: 'cam', x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0 });
    const cams = this._camPointers();
    if (cams.length === 2) this.pinch = { d0: Math.hypot(cams[0].x - cams[1].x, cams[0].y - cams[1].y) || 1, dist0: this.g.ctrl.dist };
  }

  _moveEv(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.role === 'stick') {
      const dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
      const R = 56;
      const len = Math.hypot(dx, dy);
      const k = len > R ? R / len : 1;
      this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const mag = Math.min(1, len / R);
      this.move = { x: len ? (dx / len) * mag : 0, y: len ? (dy / len) * mag : 0, mag, active: mag > 0.12 };
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    p.moved += Math.abs(dx) + Math.abs(dy);
    const cams = this._camPointers();
    if (this.pinch && cams.length >= 2) {
      const d = Math.hypot(cams[0].x - cams[1].x, cams[0].y - cams[1].y) || 1;
      this.g.ctrl.dist = Math.max(2.5, Math.min(30, (this.pinch.dist0 * this.pinch.d0) / d));
    } else if (!this.pinch) {
      this.g.ctrl.orbit(dx * 1.5, dy * 1.2);
    }
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.role === 'stick') {
      this.stickId = null;
      this.move = { x: 0, y: 0, mag: 0, active: false };
      this.knob.style.transform = 'translate(0px, 0px)';
      this.stick.classList.remove('on');
      this.stick.classList.add('idle');
      this.stick.style.left = '';
      this.stick.style.top = '';
      return;
    }
    const wasPinch = !!this.pinch;
    if (this.pinch && this._camPointers().length < 2) this.pinch = null;
    if (!wasPinch && p.moved < 12 && performance.now() - p.t0 < 400) this.g.onTap(e.clientX, e.clientY);
  }

  _bindButtons() {
    const tap = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('press'); fn(); });
      const up = () => el.classList.remove('press');
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    tap('tJump', () => { this.g.ctrl.touchJump = true; });
    tap('tTarget', () => this.g.cycleTarget());
    tap('tUse', () => this.g.interact());
    tap('tChat', () => this.g.ui.toggleChat());
    tap('tFull', () => toggleFullscreen());
  }
}
