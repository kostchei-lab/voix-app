// Courbe de hauteur défilante sur une portée en demi-tons, avec le volume en bas.
import { hzToMidi, noteName, pitchClass, isNatural } from './notes.js';

export class Trace {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.frames = [];
    this.windowSec = 8;
    this.span = 24;
    this.center = 52;
    this.targetCenter = 52;
    this.notation = 'fr';
    this.zone = null;
    this.lastT = 0;
    this.lastWall = 0;
    this.readColors();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', () => this.readColors());
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    this.c = {
      bg: v('--surface'),
      grid: v('--grid'),
      gridStrong: v('--grid-strong'),
      label: v('--muted'),
      line: v('--trace'),
      level: v('--level'),
      zone: v('--zone'),
      sep: v('--line'),
    };
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  push(f) {
    this.frames.push(f);
    this.lastT = f.t;
    this.lastWall = performance.now();
    const cut = f.t - this.windowSec - 0.5;
    let k = 0;
    while (k < this.frames.length && this.frames[k].t < cut) k++;
    if (k) this.frames.splice(0, k);
  }

  clear() {
    this.frames.length = 0;
  }

  _recenter(now) {
    const mids = [];
    for (const f of this.frames) if (f.f0 > 0 && f.t > now - 4) mids.push(hzToMidi(f.f0));
    if (mids.length > 10) {
      mids.sort((a, b) => a - b);
      const med = mids[mids.length >> 1];
      const lo = this.center - this.span / 2 + 4;
      const hi = this.center + this.span / 2 - 4;
      if (med < lo || med > hi) this.targetCenter = Math.round(med);
    }
    this.center += (this.targetCenter - this.center) * 0.08;
  }

  draw(live) {
    const g = this.g;
    const w = this.w;
    const h = this.h;
    if (!w || !h) return;
    const levelH = Math.min(40, h * 0.12);
    const ph = h - levelH;
    const now = live ? Math.min(this.lastT + (performance.now() - this.lastWall) / 1000, this.lastT + 0.2) : this.lastT;
    this._recenter(now);
    const lo = this.center - this.span / 2;
    const hi = this.center + this.span / 2;
    const y = (m) => ph - ((m - lo) / (hi - lo)) * ph;
    const xr = w - 10;
    const x = (t) => xr - ((now - t) / this.windowSec) * xr;

    g.fillStyle = this.c.bg;
    g.fillRect(0, 0, w, h);

    if (this.zone) {
      g.fillStyle = this.c.zone;
      const y1 = y(this.zone.hi);
      const y2 = y(this.zone.lo);
      g.fillRect(0, y1, w, y2 - y1);
    }

    const pxPer = ph / this.span;
    g.font = '11px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
      const pc = pitchClass(m);
      const nat = isNatural(m);
      if (!nat && pxPer < 9) continue;
      const yy = Math.round(y(m)) + 0.5;
      g.strokeStyle = pc === 0 ? this.c.gridStrong : this.c.grid;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(w, yy);
      g.stroke();
      if (nat && (pxPer >= 12 || pc === 0 || pc === 9)) {
        g.fillStyle = this.c.label;
        g.fillText(noteName(m, this.notation), 6, yy - 6);
      }
    }

    g.save();
    g.beginPath();
    g.rect(0, 0, w, ph);
    g.clip();
    g.strokeStyle = this.c.line;
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    let prev = null;
    for (const f of this.frames) {
      if (f.f0 <= 0) { prev = null; continue; }
      const m = hzToMidi(f.f0);
      const px = x(f.t);
      const py = y(m);
      if (prev && f.t - prev.t < 0.07 && Math.abs(m - prev.m) < 2.5) g.lineTo(px, py);
      else { g.moveTo(px, py); g.lineTo(px + 0.01, py); }
      prev = { t: f.t, m };
    }
    g.stroke();
    const last = this.frames[this.frames.length - 1];
    if (live && last && last.f0 > 0) {
      g.fillStyle = this.c.line;
      g.beginPath();
      g.arc(x(last.t), y(hzToMidi(last.f0)), 5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    g.strokeStyle = this.c.sep;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, ph + 0.5);
    g.lineTo(w, ph + 0.5);
    g.stroke();
    g.fillStyle = this.c.level;
    const bw = Math.max(1.5, w / (this.windowSec * 50) + 0.5);
    for (const f of this.frames) {
      const v = Math.max(0, Math.min(1, (f.db + 70) / 60));
      if (v <= 0) continue;
      g.fillRect(x(f.t) - bw, h - v * (levelH - 2), bw, v * (levelH - 2));
    }
  }
}
