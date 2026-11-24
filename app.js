'use strict';
/* Cover Lab: playlist covers from a personal taste profile (black stars, tubes, photocopies, terminals, letters).
   Everything is drawn on a 1024x1024 canvas; the look is a function (canvas, params, state, env). */
const S = 1024, TAU = Math.PI * 2;
const $ = (q, r = document) => r.querySelector(q);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const mk = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rngFrom = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pick = (a, r) => a[Math.floor(r() * a.length)];
const hashStr = str => { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lumHex = h => { const [r, g, b] = hex2rgb(h); return .299 * r + .587 * g + .114 * b; };
const HAS_FILTER = 'filter' in CanvasRenderingContext2D.prototype;

const PAL = { black: '#0b0b0a', ink: '#17140f', night: '#07120e', bone: '#e9e2cf', white: '#f5f3ee', red: '#cf1620', blue: '#1a1ad8', green: '#6dff8f', amber: '#ffb43c', ice: '#a9c8ea' };
const BANK0 = `Qué breve es la vida y qué largo puede ser un recuerdo.
Hay personas que no desaparecen: se vuelven parte de la manera en que uno recuerda el mundo.
Es extraño extrañar un lugar en el que nunca has vivido.
Hay regalos que no terminan cuando se entregan.
Uno no sabe cuándo está viviendo un recuerdo.
Hay personas que se sienten como una película de Godard.
Hay cosas que uno aprende a mirar con los ojos de adentro.
Gracias por hacerme más humano, lamento no haberlo sido contigo.
Cuánto de alguien puede quedarse en uno sin que ese alguien lo sepa.
Tu voz, tus ojos, tus manos, tus labios.
Pero deja intactas algunas cosas.
Después abriría la mano.
Te extraño.
Y es la tuya.`;

/* ---------- canvas helpers ---------- */
const rr = (c, x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };

function blurred(src, r) {
  if (r <= .1) return src;
  const o = mk(src.width, src.height), x = o.getContext('2d');
  if (HAS_FILTER) { x.filter = `blur(${r}px)`; x.drawImage(src, 0, 0); return o; }
  const k = Math.max(2, Math.round(r)), t = mk(Math.ceil(src.width / k), Math.ceil(src.height / k));
  t.getContext('2d').drawImage(src, 0, 0, t.width, t.height);
  x.imageSmoothingQuality = 'high'; x.drawImage(t, 0, 0, src.width, src.height); return o;
}

function drawPhoto(c, img, x, y, w, h, ph) {
  if (!img) return false;
  const sc = Math.max(w / img.width, h / img.height) * ph.zoom, dw = img.width * sc, dh = img.height * sc;
  const dx = x + (w - dw) / 2 + ph.px * w * .4, dy = y + (h - dh) / 2 + ph.py * h * .4;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  if (ph.flip) { c.translate(x + w / 2, 0); c.scale(-1, 1); c.translate(-(x + w / 2), 0); }
  c.drawImage(img, dx, dy, dw, dh); c.restore(); return true;
}

const BAYER = [0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31, 8, 56, 4, 52, 11, 59, 7, 55, 40, 24, 36, 20, 43, 27, 39, 23, 2, 50, 14, 62, 1, 49, 13, 61, 34, 18, 46, 30, 33, 17, 45, 29, 10, 58, 6, 54, 9, 57, 5, 53, 42, 26, 38, 22, 41, 25, 37, 21];
/* photo -> two-colour (or grey) image between `ink` (dark) and `paper` (light) */
function tone(src, o) {
  const w = src.width, h = src.height, out = mk(w, h), x = out.getContext('2d');
  const id = src.getContext('2d').getImageData(0, 0, w, h), d = id.data;
  const ink = hex2rgb(o.invert ? o.paper : o.ink), pap = hex2rgb(o.invert ? o.ink : o.paper), rnd = rngFrom(o.seed || 1);
  const contrast = o.contrast ?? 1.6, bright = o.bright ?? 0, thr = o.thr ?? 128, grit = o.grit ?? 1;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let l = (.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2] - 128) * contrast + 128 + bright, v = l;
    if (o.mode !== 'gray') {
      let t = thr;
      if (o.mode === 'noise') t += (rnd() - .5) * 150 * grit;
      else if (o.mode === 'dither') t += (BAYER[((p / w | 0) & 7) * 8 + (p % w & 7)] / 63 - .5) * 170;
      v = l > t ? 255 : 0;
    }
    const k = clamp(v, 0, 255) / 255;
    d[i] = lerp(ink[0], pap[0], k); d[i + 1] = lerp(ink[1], pap[1], k); d[i + 2] = lerp(ink[2], pap[2], k); d[i + 3] = 255;
  }
  x.putImageData(id, 0, 0); return out;
}

function starPath(cx, cy, R, n, inner, rot, rough, rnd) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n - Math.PI / 2, r = i % 2 ? R * inner : R; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  const p = new Path2D(), seg = 16, j = rough * R * .022; let first = true;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let k = 0; k < seg; k++) {
      const t = k / seg, x = lerp(a[0], b[0], t) + (k ? (rnd() - .5) * j * 2 : 0), y = lerp(a[1], b[1], t) + (k ? (rnd() - .5) * j * 2 : 0);
      first ? p.moveTo(x, y) : p.lineTo(x, y); first = false;
    }
  }
  p.closePath(); return p;
}

function bolt(c, x, y, w, h, mode, rnd) {
  const P = [[.2, 0], [1, 0], [.55, .38], [.95, .38], [.05, 1], [.38, .53], [0, .53]];
  const path = (dx, dy) => { const p = new Path2D(); P.forEach(([u, v], i) => { const X = x + u * w + dx + (rnd() - .5) * 3, Y = y + v * h + dy + (rnd() - .5) * 3; i ? p.lineTo(X, Y) : p.moveTo(X, Y); }); p.closePath(); return p; };
  if (mode === 'red+blue') { c.fillStyle = PAL.blue; c.fill(path(-w * .055, 0)); }
  c.fillStyle = PAL.red; c.fill(path(0, 0));
  c.save(); c.clip(path(0, 0)); c.fillStyle = 'rgba(255,255,255,.18)';
  for (let i = 0; i < 700; i++) c.fillRect(x + rnd() * w, y + rnd() * h, 1.6, 1.6); c.restore();
}

const RAMPS = { dots: ' .,:;-=+*#%@', blocks: ' ░▒▓█', slashes: ' ·/\\|+x#' };
function asciiPhoto(c, img, ph, cell, color, alpha, contrast, ramp) {
  const lineH = cell * 1.7, cols = Math.floor(S / cell), rows = Math.floor(S / lineH), t = mk(cols, rows), tc = t.getContext('2d');
  tc.fillStyle = '#000'; tc.fillRect(0, 0, cols, rows); drawPhoto(tc, img, 0, 0, cols, rows, ph);
  const d = tc.getImageData(0, 0, cols, rows).data;
  c.save(); c.font = `${cell * 1.6}px Menlo,Monaco,"Courier New",monospace`; c.textBaseline = 'top'; c.fillStyle = color;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4, l = clamp(((.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]) / 255 - .5) * contrast + .5, 0, 1), ch = ramp[Math.floor(l * (ramp.length - 1))];
    if (ch === ' ') continue; c.globalAlpha = clamp(alpha * (.3 + .7 * l), 0, 1); c.fillText(ch, x * cell, y * lineH);
  }
  c.restore();
}

function halftone(c, o, x0, y0, color, d, contrast, bright, off, alpha, ang) {
  const w = o.width, h = o.height, data = o.getContext('2d').getImageData(0, 0, w, h).data, ca = Math.cos(ang), sa = Math.sin(ang), diag = Math.hypot(w, h);
  c.save(); c.globalAlpha = alpha; c.fillStyle = color; c.beginPath(); let n = 0;
  for (let v = -diag / 2; v < diag / 2; v += d) for (let u = -diag / 2; u < diag / 2; u += d) {
    const x = w / 2 + u * ca - v * sa, y = h / 2 + u * sa + v * ca; if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = ((y | 0) * w + (x | 0)) * 4, l = clamp((.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2] - 128) * contrast + 128 + bright, 0, 255), r = d * .76 * Math.sqrt(1 - l / 255);
    if (r < .45) continue;
    const X = x0 + x + off[0], Y = y0 + y + off[1]; c.moveTo(X + r, Y); c.arc(X, Y, r, 0, TAU);
    if (++n % 3000 === 0) { c.fill(); c.beginPath(); }
  }
  c.fill(); c.restore();
}

/* ---------- finishing: the film/tape/print damage shared by every look ---------- */
function bloom(c, amt) {
  const t = c.canvas;
  for (const [sz, a] of [[96, .55], [24, .7]]) {
    const s = mk(sz); s.getContext('2d').drawImage(t, 0, 0, sz, sz);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = amt * a; c.imageSmoothingQuality = 'high'; c.drawImage(s, 0, 0, S, S); c.restore();
  }
}
function barrel(c, k) {
  const id = c.getImageData(0, 0, S, S), src = id.data, out = c.createImageData(S, S), d = out.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const nx = (x / S - .5) * 2, ny = (y / S - .5) * 2, f = 1 + k * .22 * (nx * nx + ny * ny), sx = ((nx * f) / 2 + .5) * S, sy = ((ny * f) / 2 + .5) * S, o = (y * S + x) * 4;
    if (sx < 0 || sy < 0 || sx >= S - 1 || sy >= S - 1) { d[o + 3] = 255; continue; }
    const si = ((sy | 0) * S + (sx | 0)) * 4; d[o] = src[si]; d[o + 1] = src[si + 1]; d[o + 2] = src[si + 2]; d[o + 3] = 255;
  }
  c.putImageData(out, 0, 0);
}
function chroma(c, px) {
  const id = c.getImageData(0, 0, S, S), s = id.data, o = new Uint8ClampedArray(s), sh = Math.round(px);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, r = (y * S + clamp(x - sh, 0, S - 1)) * 4, b = (y * S + clamp(x + sh, 0, S - 1)) * 4;
    o[i] = s[r]; o[i + 2] = s[b + 2];
  }
  id.data.set(o); c.putImageData(id, 0, 0);
}
function vignette(c, v) {
  const g = c.createRadialGradient(S / 2, S / 2, S * .3, S / 2, S / 2, S * .78); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${v})`);
  c.fillStyle = g; c.fillRect(0, 0, S, S);
}
function grain(c, amt, rnd) {
  const id = c.getImageData(0, 0, S, S), d = id.data, a = amt * 70;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - .5) * a; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(id, 0, 0);
}
function dust(c, amt, rnd) {
  c.save();
  for (let i = 0; i < amt * 160; i++) { c.fillStyle = rnd() < .6 ? 'rgba(240,235,220,.55)' : 'rgba(0,0,0,.5)'; const r = rnd() * 1.8 + .4; c.beginPath(); c.arc(rnd() * S, rnd() * S, r, 0, TAU); c.fill(); }
  c.lineWidth = 1;
  for (let i = 0; i < amt * 7; i++) { c.strokeStyle = rnd() < .5 ? 'rgba(240,235,220,.25)' : 'rgba(0,0,0,.3)'; const x = rnd() * S, y = rnd() * S, l = 30 + rnd() * 200; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - .5) * 8, y + l); c.stroke(); }
  c.restore();
}
function finish(c, F, rnd) {
  if (F.bloom > 0) bloom(c, F.bloom);
  if (F.curve > 0) barrel(c, F.curve);
  if (F.chroma > 0) chroma(c, F.chroma);
  if (F.vig > 0) vignette(c, F.vig);
  if (F.grain > 0) grain(c, F.grain, rnd);
  if (F.dust > 0) dust(c, F.dust, rnd);
}

/* ---------- looks ---------- */
const STYLES = {};
const def = (id, name, desc, schema, looks, draw) => { STYLES[id] = { id, name, desc, schema, looks, draw }; };
const R = (k, l, min, max, step, v) => ({ k, l, t: 'r', min, max, step, v });
const SW = (k, l, o, v) => ({ k, l, t: 'sw', o, v });
const SEL = (k, l, o, v) => ({ k, l, t: 'sel', o, v });
const CHK = (k, l, v) => ({ k, l, t: 'chk', v });

def('star', 'Star', 'a portrait cut into a black star', [
  SW('paper', 'paper', ['white', 'bone', 'black', 'red', 'blue'], 'white'), SW('ink', 'star', ['black', 'ink', 'red', 'blue', 'bone'], 'black'),
  R('size', 'star size', .35, 1, .01, .84), R('pts', 'points', 4, 9, 1, 5), R('pointy', 'pointiness', .2, .6, .01, .382), R('rot', 'rotate', -180, 180, 1, 0), R('rough', 'rough edge', 0, 1, .01, .3),
  SEL('mode', 'tone', ['noise', 'thr', 'dither', 'gray'], 'noise'), R('thr', 'threshold', 20, 235, 1, 128), R('contrast', 'contrast', .5, 4, .05, 1.8), R('grit', 'grit', 0, 1.5, .01, 1), R('blur', 'soften', 0, 12, .5, 2),
  CHK('invert', 'invert photo', false), SEL('bolt', 'lightning', ['none', 'red+blue', 'red'], 'none'),
], [
  { n: 'blackstar', p: {}, fx: { grain: .3, dust: .2, vig: 0, bloom: 0 } },
  { n: 'bone', p: { paper: 'bone', ink: 'ink', mode: 'thr', blur: 4, rough: .5 }, fx: { grain: .5, dust: .5, vig: .2 } },
  { n: 'negative', p: { paper: 'black', ink: 'bone', mode: 'thr', blur: 3 }, fx: { grain: .35, dust: .3 } },
  { n: 'blood', p: { ink: 'red', mode: 'noise', grit: 1.2 }, fx: { grain: .35 } },
  { n: 'blue', p: { paper: 'bone', ink: 'blue', mode: 'thr' }, fx: { grain: .4, dust: .4 } },
  { n: 'ziggy', p: { paper: 'white', bolt: 'red+blue', size: .72, mode: 'noise' }, fx: { grain: .3 } },
  { n: 'gray', p: { paper: 'white', ink: 'black', mode: 'gray', contrast: 1.3, blur: 0 }, fx: { grain: .4, dust: .4 } },
], (c, P, s, E) => {
  c.fillStyle = PAL[P.paper]; c.fillRect(0, 0, S, S);
  const R = S * .5 * P.size, n = P.pts | 0, cx = S / 2, cy = S / 2 + (n === 5 ? R * .0955 : 0);
  const path = starPath(cx, cy, R, n, P.pointy, P.rot * Math.PI / 180, P.rough, E.rnd);
  c.fillStyle = PAL[P.ink]; c.fill(path);
  if (E.img) {
    const w = Math.round(R * 2), o = mk(w), oc = o.getContext('2d'); oc.fillStyle = '#808080'; oc.fillRect(0, 0, w, w); drawPhoto(oc, E.img, 0, 0, w, w, s.photo);
    const t = tone(blurred(o, P.blur), { ink: PAL[P.ink], paper: PAL[P.paper], mode: P.mode, thr: P.thr, contrast: P.contrast, grit: P.grit, invert: P.invert, seed: s.seed });
    c.save(); c.clip(path); c.drawImage(t, cx - R, cy - R); c.restore();
  }
  if (P.bolt !== 'none') bolt(c, cx + R * .02, cy - R * .32, R * .95, R * 1.3, P.bolt, E.rnd);
});

def('screen', 'Screen', 'a still on an old tube, in the dark', [
  SW('tint', 'phosphor', ['white', 'ice', 'green', 'amber', 'red'], 'white'), R('width', 'screen width', .3, .95, .01, .58), SEL('aspect', 'aspect', ['4:3', '1:1', '3:2', '16:9'], '4:3'),
  R('round', 'corner round', 0, .2, .01, .06), R('contrast', 'contrast', .6, 3, .05, 1.1), R('bright', 'brightness', -60, 60, 1, -8), R('scan', 'scanlines', 0, 1, .01, .35),
  R('glow', 'screen glow', 0, 1, .01, .55), CHK('roll', 'roll bar', true), CHK('osd', 'play / rec symbols', true), R('ypos', 'vertical position', -.3, .3, .01, -.05),
], [
  { n: 'film still', p: {}, fx: { grain: .5, dust: .45, vig: .35, bloom: .25 } },
  { n: 'green tube', p: { tint: 'green', scan: .5, contrast: 1.4 }, fx: { grain: .4, curve: .35, bloom: .35 } },
  { n: 'amber', p: { tint: 'amber', width: .7, aspect: '3:2' }, fx: { grain: .45, curve: .2, bloom: .3 } },
  { n: 'blue static', p: { tint: 'ice', contrast: 1.5, roll: true, aspect: '1:1', width: .66 }, fx: { grain: .6, chroma: 3, bloom: .3 } },
  { n: 'tiny', p: { width: .36, aspect: '4:3', ypos: 0 }, fx: { grain: .5, dust: .5, vig: .4, bloom: .3 } },
], (c, P, s, E) => {
  c.fillStyle = '#040404'; c.fillRect(0, 0, S, S);
  const ar = { '4:3': 4 / 3, '1:1': 1, '3:2': 1.5, '16:9': 16 / 9 }[P.aspect], tint = PAL[P.tint];
  const w = Math.round(S * P.width), h = Math.round(w / ar), x = Math.round((S - w) / 2), y = Math.round((S - h) / 2 + S * P.ypos), rad = Math.min(w, h) * P.round;
  const o = mk(w, h), oc = o.getContext('2d'); oc.fillStyle = '#555'; oc.fillRect(0, 0, w, h);
  if (E.img) drawPhoto(oc, E.img, 0, 0, w, h, s.photo);
  const t = tone(o, { ink: '#000000', paper: tint, mode: 'gray', contrast: P.contrast, bright: P.bright });
  if (P.glow > 0) {                                     // light spilling out of the glass
    const g = mk(S); g.getContext('2d').drawImage(t, x, y); const gb = blurred(g, w * .07);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = P.glow * .7; c.drawImage(gb, 0, 0); c.restore();
  }
  c.save(); rr(c, x - 7, y - 7, w + 14, h + 14, rad + 7); c.fillStyle = '#0c0c0c'; c.fill(); c.restore();
  c.save(); rr(c, x, y, w, h, rad); c.clip(); c.drawImage(t, x, y);
  const vg = c.createRadialGradient(x + w / 2, y + h / 2, h * .25, x + w / 2, y + h / 2, w * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)'); c.fillStyle = vg; c.fillRect(x, y, w, h);
  c.fillStyle = `rgba(0,0,0,${.5 * P.scan})`; for (let yy = y; yy < y + h; yy += 3) c.fillRect(x, yy, w, 1.4);
  if (P.roll) { const ry = y + ((E.rnd() * .8 + .1) * h); const g = c.createLinearGradient(0, ry - h * .08, 0, ry + h * .08); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.13)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x, ry - h * .08, w, h * .16); }
  const gl = c.createLinearGradient(x, y, x + w * .6, y + h * .6); gl.addColorStop(0, 'rgba(255,255,255,.07)'); gl.addColorStop(.5, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(x, y, w, h);
  if (P.osd) {                                          // symbols only: play triangle, rec dot, tracking bars
    const ps = Math.max(2, Math.round(w / 190)), k = tint;
    c.fillStyle = k; c.beginPath(); c.moveTo(x + w * .05, y + h * .07); c.lineTo(x + w * .05, y + h * .07 + ps * 8); c.lineTo(x + w * .05 + ps * 7, y + h * .07 + ps * 4); c.fill();
    c.fillStyle = PAL.red; c.beginPath(); c.arc(x + w * .93, y + h * .1, ps * 3.2, 0, TAU); c.fill();
    c.fillStyle = k; c.globalAlpha = .75; for (let i = 0; i < 9; i++) c.fillRect(x + w * .05 + i * ps * 4, y + h * .9 - (i % 3 === 0 ? ps * 5 : ps * 3), ps * 2, i % 3 === 0 ? ps * 5 : ps * 3); c.globalAlpha = 1;
  }
  c.restore();
});

def('xerox', 'Xerox', 'a photocopy of a photocopy', [
  SW('paper', 'paper', ['bone', 'white', 'black'], 'bone'), SW('toner', 'toner', ['black', 'ink', 'red', 'blue'], 'black'),
  SEL('mode', 'print', ['halftone', 'noise', 'thr'], 'halftone'), R('dot', 'dot size', 4, 16, 1, 8), R('contrast', 'contrast', .6, 4, .05, 1.7), R('bright', 'brightness', -60, 60, 1, 0), R('thr', 'threshold', 20, 235, 1, 128),
  SEL('frame', 'crop', ['inset', 'full', 'circle'], 'inset'), R('ghost', 'misregistration', 0, 1, .01, .45), R('edge', 'copier shadow', 0, 1, .01, .6), R('streaks', 'toner streaks', 0, 1, .01, .5), CHK('tape', 'tape', true),
], [
  { n: 'zine', p: {}, fx: { grain: .4, dust: .6, vig: .15 } },
  { n: 'noir copy', p: { mode: 'noise', frame: 'full', edge: .8, tape: false, paper: 'white' }, fx: { grain: .5, dust: .5, vig: .2 } },
  { n: 'red toner', p: { toner: 'red', mode: 'thr', frame: 'circle' }, fx: { grain: .4, dust: .5 } },
  { n: 'dark room', p: { paper: 'black', toner: 'bone', mode: 'halftone', dot: 7, edge: 0, tape: false }, fx: { grain: .5, dust: .4, vig: .3 } },
], (c, P, s, E) => {
  const paper = PAL[P.paper], toner = PAL[P.toner]; c.fillStyle = paper; c.fillRect(0, 0, S, S);
  c.save(); c.globalAlpha = .06; c.strokeStyle = lumHex(paper) > 140 ? '#000' : '#fff'; for (let i = 0; i < 500; i++) { const x = E.rnd() * S, y = E.rnd() * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (E.rnd() - .5) * 26, y + (E.rnd() - .5) * 26); c.stroke(); } c.restore();
  const m = P.frame === 'full' ? 0 : S * .085, capH = 0;
  const fx = m, fy = m, fw = S - 2 * m, fh = S - 2 * m - capH;
  const o = mk(Math.round(fw), Math.round(fh)), oc = o.getContext('2d'); oc.fillStyle = '#777'; oc.fillRect(0, 0, o.width, o.height); if (E.img) drawPhoto(oc, E.img, 0, 0, o.width, o.height, s.photo);
  const clip = new Path2D();
  if (P.frame === 'circle') clip.ellipse(S / 2, fy + fh / 2, Math.min(fw, fh) / 2, Math.min(fw, fh) / 2, 0, 0, TAU);
  else { const j = P.frame === 'full' ? 0 : 3.5, seg = 22, pts = [[fx, fy], [fx + fw, fy], [fx + fw, fy + fh], [fx, fy + fh]]; let first = true; for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; for (let k = 0; k < seg; k++) { const t = k / seg, X = lerp(a[0], b[0], t) + (E.rnd() - .5) * j, Y = lerp(a[1], b[1], t) + (E.rnd() - .5) * j; first ? clip.moveTo(X, Y) : clip.lineTo(X, Y); first = false; } } clip.closePath(); }
  c.save(); c.clip(clip);
  if (P.mode === 'halftone') {
    if (P.ghost > 0) halftone(c, o, fx, fy, P.toner === 'blue' ? PAL.red : PAL.blue, P.dot, P.contrast, P.bright, [P.dot * .9 * P.ghost, P.dot * .6 * P.ghost], .55, Math.PI / 4 + .2);
    halftone(c, o, fx, fy, toner, P.dot, P.contrast, P.bright, [0, 0], .96, Math.PI / 4);
  } else {
    const t = tone(blurred(o, 1.2), { ink: toner, paper, mode: P.mode, thr: P.thr, contrast: P.contrast, bright: P.bright, seed: s.seed, grit: 1 });
    c.drawImage(t, fx, fy);
  }
  c.restore();
  if (P.edge > 0) {                                      // the copier lid shadow
    let g = c.createLinearGradient(0, 0, S * .2, 0); g.addColorStop(0, `rgba(0,0,0,${.92 * P.edge})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, S * .2, S);
    g = c.createLinearGradient(0, S, 0, S - S * .12); g.addColorStop(0, `rgba(0,0,0,${.7 * P.edge})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, S - S * .12, S, S * .12);
  }
  c.save(); c.fillStyle = toner; for (let i = 0; i < 28 * P.streaks; i++) { c.globalAlpha = .06 + E.rnd() * .16; c.fillRect(E.rnd() * S, 0, .8 + E.rnd() * 2.2, S); } c.restore();
  if (P.tape) for (const [tx, ty, a] of [[S * .1, S * .06, -.45], [S * .9, S * .07, .5]]) { c.save(); c.translate(tx, ty); c.rotate(a); c.fillStyle = 'rgba(225,212,170,.62)'; c.fillRect(-S * .06, -S * .022, S * .12, S * .044); c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(-S * .06, -S * .022, S * .12, S * .01); c.restore(); }
});

def('terminal', 'Terminal', 'your photo drawn in phosphor characters', [
  SW('color', 'phosphor', ['green', 'amber', 'white', 'ice', 'red'], 'green'), SEL('ramp', 'characters', ['dots', 'blocks', 'slashes'], 'dots'), R('cell', 'character size', 6, 22, 1, 9),
  R('ascii', 'brightness', .3, 1.5, .01, 1), R('contrast', 'contrast', .6, 3, .05, 1.5), R('scan', 'scanlines', 0, 1, .01, .45), R('glow', 'glow', 0, 1, .01, .5),
], [
  { n: 'green', p: {}, fx: { grain: .35, curve: .45, bloom: .4, vig: .4 } },
  { n: 'amber', p: { color: 'amber' }, fx: { grain: .4, curve: .35, bloom: .4, vig: .4 } },
  { n: 'cold', p: { color: 'ice', cell: 7 }, fx: { grain: .4, curve: .3, bloom: .35, vig: .4, chroma: 2 } },
  { n: 'blocks', p: { color: 'white', ramp: 'blocks', cell: 14, contrast: 1.8 }, fx: { grain: .35, curve: .25, bloom: .3, vig: .4 } },
  { n: 'red', p: { color: 'red', ramp: 'slashes', cell: 10 }, fx: { grain: .4, curve: .3, bloom: .4, vig: .4 } },
], (c, P, s, E) => {
  const col = PAL[P.color]; c.fillStyle = '#030604'; c.fillRect(0, 0, S, S);
  const rg = c.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S * .7); rg.addColorStop(0, col + '26'); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.fillRect(0, 0, S, S);
  if (E.img) asciiPhoto(c, E.img, s.photo, P.cell, col, P.ascii, P.contrast, RAMPS[P.ramp]);
  c.fillStyle = `rgba(0,0,0,${.5 * P.scan})`; for (let yy = 0; yy < S; yy += 3) c.fillRect(0, yy, S, 1.3);
  const ry = E.rnd() * S, g = c.createLinearGradient(0, ry - 60, 0, ry + 60); g.addColorStop(0, col + '00'); g.addColorStop(.5, col + '14'); g.addColorStop(1, col + '00'); c.fillStyle = g; c.fillRect(0, ry - 60, S, 120);
  if (P.glow > 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = P.glow * .5; c.drawImage(blurred(c.canvas, 6), 0, 0); c.restore(); }
});

def('still', 'Still', 'a frame from a film you never found', [
  SW('paper', 'border', ['black', 'bone', 'white'], 'black'), SW('tint', 'light', ['white', 'bone', 'ice', 'amber', 'red', 'green'], 'white'), SEL('mode', 'tone', ['gray', 'thr', 'noise', 'dither'], 'gray'),
  R('contrast', 'contrast', .6, 4, .05, 1.6), R('bright', 'brightness', -60, 60, 1, 0), R('thr', 'threshold', 20, 235, 1, 128), R('blur', 'soften', 0, 10, .5, 0),
  SEL('frame', 'frame', ['full', 'letterbox', 'border', 'sprockets', 'circle'], 'full'), R('glow', 'halation', 0, 1, .01, .3), CHK('invert', 'invert', false),
], [
  { n: 'noir', p: {}, fx: { grain: .5, dust: .4, vig: .35 } },
  { n: 'harsh', p: { mode: 'thr', contrast: 2.2, frame: 'letterbox' }, fx: { grain: .4, dust: .5, vig: .3 } },
  { n: 'contact print', p: { frame: 'border', paper: 'white', contrast: 1.4 }, fx: { grain: .45, dust: .4, vig: .15 } },
  { n: '16mm', p: { frame: 'sprockets', tint: 'bone' }, fx: { grain: .6, dust: .6, vig: .35 } },
  { n: 'blue hour', p: { tint: 'ice', contrast: 1.8 }, fx: { grain: .5, dust: .3, vig: .4, bloom: .15 } },
  { n: 'porthole', p: { frame: 'circle', mode: 'noise' }, fx: { grain: .45, dust: .4, vig: .3 } },
], (c, P, s, E) => {
  const paper = PAL[P.paper]; c.fillStyle = paper; c.fillRect(0, 0, S, S);
  let x = 0, y = 0, w = S, h = S;
  if (P.frame === 'letterbox') { h = Math.round(S / 2.39); y = Math.round((S - h) / 2); }
  else if (P.frame === 'border') { x = y = Math.round(S * .075); w = h = S - 2 * x; }
  else if (P.frame === 'sprockets') { x = Math.round(S * .13); w = S - 2 * x; }
  const o = mk(w, h), oc = o.getContext('2d'); oc.fillStyle = '#555'; oc.fillRect(0, 0, w, h); if (E.img) drawPhoto(oc, E.img, 0, 0, w, h, s.photo);
  const t = tone(blurred(o, P.blur), { ink: '#000000', paper: PAL[P.tint], mode: P.mode, thr: P.thr, contrast: P.contrast, bright: P.bright, invert: P.invert, seed: s.seed, grit: 1 });
  c.save(); if (P.frame === 'circle') { c.beginPath(); c.arc(S / 2, S / 2, S * .42, 0, TAU); c.clip(); } c.drawImage(t, x, y); c.restore();
  if (P.frame === 'sprockets') {                         // film perforations
    c.fillStyle = PAL[P.paper === 'black' ? 'bone' : 'black']; c.globalAlpha = .85;
    for (let yy = S * .02; yy < S; yy += S * .062) { rr(c, S * .045, yy, S * .042, S * .03, 5); c.fill(); rr(c, S - S * .087, yy, S * .042, S * .03, 5); c.fill(); }
    c.globalAlpha = 1;
  }
  if (P.glow > 0) bloom(c, P.glow * .6);
});

/* ---------- state ---------- */
const FX_DEF = { grain: .35, dust: .25, vig: .3, bloom: 0, chroma: 0, curve: 0 };
const FX_SCHEMA = [R('grain', 'grain', 0, 1, .01, 0), R('dust', 'dust + scratches', 0, 1, .01, 0), R('vig', 'vignette', 0, 1, .01, 0), R('bloom', 'bloom', 0, 1, .01, 0), R('chroma', 'RGB split', 0, 10, .5, 0), R('curve', 'tube curve', 0, 1, .01, 0)];
const PHOTO_SCHEMA = [R('zoom', 'zoom', 1, 3, .01, 1), R('px', 'move x', -1, 1, .01, 0), R('py', 'move y', -1, 1, .01, 0), CHK('flip', 'flip', false)];
const clone = o => JSON.parse(JSON.stringify(o));

function defaultState() {
  const p = {}; for (const id in STYLES) { p[id] = {}; STYLES[id].schema.forEach(d => p[id][d.k] = d.v); }
  return { style: 'star', seed: 7, mood: '', src: { kind: 'none' }, photo: { zoom: 1, px: 0, py: 0, flip: false }, fx: { ...FX_DEF }, p };
}
let state = defaultState(), lib = [], bank = [], userImg = null; const imgCache = {};
const loadUrl = url => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
const libImg = async name => imgCache[name] || (imgCache[name] = await loadUrl('inspo/' + encodeURIComponent(name)));
async function imgFor(st) { try { return st.src.kind === 'user' ? userImg : st.src.kind === 'lib' ? await libImg(st.src.name) : null; } catch { return null; } }

function applyLook(st, look) {
  const d = defaultState(), P = st.p[st.style], D = d.p[st.style];
  Object.assign(P, D, look.p || {}); st.fx = { ...FX_DEF, grain: 0, dust: 0, vig: 0, ...(look.fx || {}) };
}

/* ---------- render ---------- */
async function renderState(ctx, st) {
  const E = { img: await imgFor(st), rnd: rngFrom(st.seed) };
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
  STYLES[st.style].draw(ctx, st.p[st.style], st, E); finish(ctx, st.fx, E.rnd); ctx.restore();
}
const cv = $('#cv'), cx2 = cv.getContext('2d', { willReadFrequently: true }); let pending = false, busy = false;
function schedule() { if (pending) return; pending = true; requestAnimationFrame(async () => { pending = false; if (busy) { schedule(); return; } busy = true; try { await renderState(cx2, state); } finally { busy = false; } save(); }); }

/* ---------- UI ---------- */
function rowOf(def, obj, onchange) {
  const row = document.createElement('div'); row.className = 'row'; const lab = document.createElement('label'); lab.textContent = def.l; row.append(lab);
  const set = v => { obj[def.k] = v; onchange && onchange(); schedule(); };
  if (def.t === 'r') {
    const inp = document.createElement('input'), out = document.createElement('output'); inp.type = 'range'; Object.assign(inp, { min: def.min, max: def.max, step: def.step, value: obj[def.k] });
    out.textContent = (+obj[def.k]).toFixed(def.step < 1 ? 2 : 0); inp.oninput = () => { out.textContent = (+inp.value).toFixed(def.step < 1 ? 2 : 0); set(+inp.value); }; row.append(inp, out);
  } else {
    row.className = 'row t';
    if (def.t === 'sel') { const s = document.createElement('select'); def.o.forEach(o => s.add(new Option(o, o))); s.value = obj[def.k]; s.onchange = () => set(s.value); row.append(s); }
    else if (def.t === 'chk') { const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!obj[def.k]; i.onchange = () => set(i.checked); row.append(i); }
    else if (def.t === 'sw') {
      const w = document.createElement('div'); w.className = 'sw';
      def.o.forEach(o => { const b = document.createElement('button'); b.title = o; b.style.background = o === 'auto' ? 'linear-gradient(135deg,#000 50%,#fff 50%)' : PAL[o]; if (obj[def.k] === o) b.classList.add('on'); b.onclick = () => { [...w.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); set(o); }; w.append(b); });
      row.append(w);
    }
  }
  return row;
}
function fill(host, schema, obj, onchange) { host.innerHTML = ''; schema.forEach(d => host.append(rowOf(d, obj, onchange))); }
function build() {
  const tabs = $('#tabs'); tabs.innerHTML = '';
  Object.values(STYLES).forEach(st => { const b = document.createElement('button'); b.textContent = st.name; if (st.id === state.style) b.classList.add('on'); b.onclick = () => { state.style = st.id; build(); schedule(); }; tabs.append(b); });
  const st = STYLES[state.style]; $('#desc').textContent = st.desc;
  const lk = $('#looks'); lk.innerHTML = ''; st.looks.forEach(l => { const b = document.createElement('button'); b.textContent = l.n; b.onclick = () => { applyLook(state, l); build(); schedule(); }; lk.append(b); });
  fill($('#controls'), st.schema, state.p[state.style]); fill($('#photoc'), PHOTO_SCHEMA, state.photo); fill($('#fxc'), FX_SCHEMA, state.fx);
  markOn();
}
function msg(t, undo) {
  const m = $('#msg'); m.textContent = t + ' '; clearTimeout(msg.t);
  if (undo) { const b = document.createElement('button'); b.textContent = 'undo'; b.onclick = () => { clearTimeout(msg.t); m.textContent = ''; undo(); }; m.append(b); }
  msg.t = setTimeout(() => m.textContent = '', undo ? 10000 : 2600);
}

/* ---------- bank, photos ---------- */
/* ---------- mood lines: add / edit / delete (undoable) / search ---------- */
let lineFilter = '';
const saveBank = () => { try { localStorage.setItem('coverlab.bank', JSON.stringify(bank)); } catch { } };
const mkBtn = (txt, cls, title) => { const b = document.createElement('button'); b.className = cls; b.textContent = txt; b.title = title; return b; };
function drawBank() {
  const ul = $('#bank'); ul.innerHTML = ''; $('#bankcount').textContent = bank.length;
  const f = lineFilter.toLowerCase(); let shown = 0;
  bank.forEach((t, idx) => {
    if (f && !t.toLowerCase().includes(f)) return; shown++;
    const li = document.createElement('li'); if (t === state.mood) li.classList.add('on');
    const sp = document.createElement('span'); sp.textContent = t; li.append(sp);
    const e = mkBtn('✎', 'e', 'edit'), x = mkBtn('×', 'x', 'delete');
    e.onclick = ev => { ev.stopPropagation(); editLine(idx, li); }; x.onclick = ev => { ev.stopPropagation(); delLine(idx); };
    li.append(e, x); li.onclick = () => fromLine(t); ul.append(li);
  });
  if (!shown) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = bank.length ? 'no match' : 'no lines yet: write one above'; ul.append(li); }
}
function addLines(raw) {
  const ls = raw.split(/\n+/).map(x => x.trim()).filter(Boolean).filter((x, i, a) => !bank.includes(x) && a.indexOf(x) === i); if (!ls.length) return 0;
  bank.unshift(...ls); saveBank(); drawBank(); msg(`${ls.length} line${ls.length > 1 ? 's' : ''} added`); return ls.length;
}
function delLine(idx) {
  const [t] = bank.splice(idx, 1); saveBank(); drawBank();
  msg('line deleted', () => { bank.splice(idx, 0, t); saveBank(); drawBank(); msg('restored'); });
}
function editLine(idx, li) {
  const old = bank[idx], inp = document.createElement('textarea'); inp.value = old; inp.rows = Math.min(5, Math.ceil(old.length / 34)); inp.className = 'ledit';
  li.innerHTML = ''; li.classList.add('editing'); li.append(inp); li.onclick = null; inp.focus(); inp.select();
  let done = false; const end = commit => {
    if (done) return; done = true; const v = inp.value.trim();
    if (commit && v && v !== old && !bank.includes(v)) { bank[idx] = v; if (state.mood === old) state.mood = v; saveBank(); }
    drawBank();
  };
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); end(true); } else if (e.key === 'Escape') end(false); };
  inp.onblur = () => end(true);
}
function initBank() {
  const add = $('#lineadd'), go = () => { if (addLines(add.value)) add.value = ''; add.focus(); };
  add.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } }; $('#l-add').onclick = go;
  $('#linefilter').oninput = e => { lineFilter = e.target.value.trim(); drawBank(); };
  $('#b-rand').onclick = () => { if (bank.length) fromLine(pick(bank, Math.random)); };
  $('#b-reset').onclick = () => { if (confirm('Put back your original lines and remove the ones you added?')) { bank = BANK0.split('\n'); saveBank(); drawBank(); msg('original lines restored'); } };
}
function fromLine(t) { state = randomState(rngFrom(hashStr(t)), state); state.mood = t; build(); drawBank(); schedule(); }
/* ---------- photo library: add / delete (to trash, undoable) / rename / multi-select ---------- */
let selMode = false; const picked = new Set();
const post = (url, opt = {}) => fetch(url, { method: 'POST', ...opt }).then(r => r.json());
const q = encodeURIComponent;
function setLib(name) { state.src = { kind: 'lib', name }; build(); schedule(); }
async function setFile(f) { if (!f || !f.type.startsWith('image/')) return; userImg = await loadUrl(URL.createObjectURL(f)); state.src = { kind: 'user' }; build(); schedule(); }
async function refreshLib() { try { lib = await (await fetch('/api/inspo')).json(); } catch { } picked.forEach(n => { if (!lib.includes(n)) picked.delete(n); }); renderLib(); refreshTrash(); }
async function refreshTrash() {
  let tr = []; try { tr = await (await fetch('/api/trash')).json(); } catch { }
  $('#trashcount').textContent = tr.length; $('#t-all').hidden = !tr.length; const box = $('#trashlist'); box.innerHTML = '';
  if (!tr.length) { box.textContent = 'empty'; box.style.color = 'var(--dim)'; return; }
  tr.forEach(n => {
    const row = document.createElement('div'); row.className = 'tr'; const im = document.createElement('img'); im.src = 'trash/' + q(n); const sp = document.createElement('span'); sp.textContent = n; sp.title = n;
    const b = document.createElement('button'); b.textContent = 'restore'; b.onclick = async () => { await post('/api/restore?name=' + q(n)); await refreshLib(); msg('restored ' + n); };
    row.append(im, sp, b); box.append(row);
  });
}
function markOn() {
  document.querySelectorAll('#lib .th').forEach(t => t.classList.toggle('on', state.src.kind === 'lib' && t.dataset.n === state.src.name));
  const none = $('#lib .none'); if (none) none.classList.toggle('on', state.src.kind === 'none');
}
function updSel() {
  document.querySelectorAll('#lib .th[data-n]').forEach(t => t.classList.toggle('sel', picked.has(t.dataset.n)));
  $('#lib').classList.toggle('selmode', selMode); $('#l-sel').classList.toggle('on', selMode);
  $('#l-all').hidden = !selMode; $('#l-del').hidden = !selMode; $('#l-del').textContent = `Delete ${picked.size}`; $('#l-del').disabled = !picked.size;
}
function renderLib() {
  const host = $('#lib'); host.innerHTML = ''; $('#libcount').textContent = lib.length;
  const none = document.createElement('div'); none.className = 'th none'; none.textContent = 'no photo'; none.onclick = () => { state.src = { kind: 'none' }; build(); schedule(); }; host.append(none);
  lib.forEach(n => {
    const t = document.createElement('div'); t.className = 'th'; t.dataset.n = n; t.title = n;
    const im = document.createElement('img'); im.src = 'inspo/' + q(n); im.loading = 'lazy'; t.append(im);
    const ed = document.createElement('button'); ed.className = 'e'; ed.textContent = '✎'; ed.title = 'rename'; ed.onclick = e => { e.stopPropagation(); renLib(n); };
    const dx = document.createElement('button'); dx.className = 'x'; dx.textContent = '×'; dx.title = 'delete'; dx.onclick = e => { e.stopPropagation(); delLib([n]); };
    t.append(ed, dx);
    t.onclick = () => { if (selMode) { picked.has(n) ? picked.delete(n) : picked.add(n); updSel(); } else setLib(n); };
    host.append(t);
  });
  updSel(); markOn();
}
async function addFiles(files) {
  const imgs = [...files].filter(f => f.type.startsWith('image/')); if (!imgs.length) return;
  let last = null, ok = 0;
  for (const f of imgs) { try { const r = await post('/api/upload?name=' + q(f.name || 'pasted.png'), { headers: { 'Content-Type': f.type }, body: f }); if (r.name) { last = r.name; ok++; } } catch { } }
  if (ok) { await refreshLib(); setLib(last); msg(`${ok} added to the library`); }
  else { await setFile(imgs[0]); msg('library offline: photo used for this session only'); }
}
async function delLib(names) {
  if (names.length >= 3 && !confirm(`Move ${names.length} photos to the trash? You can restore them from the trash list.`)) return;
  const done = [];
  for (const n of names) { try { const r = await post('/api/delete?name=' + q(n)); if (r.trashed) { done.push(r.trashed); delete imgCache[n]; } } catch { } }
  if (!done.length) { msg('could not delete'); return; }
  picked.clear(); await refreshLib();
  if (state.src.kind === 'lib' && !lib.includes(state.src.name)) { state.src = lib.length ? { kind: 'lib', name: lib[0] } : { kind: 'none' }; build(); schedule(); }
  msg(`deleted ${done.length}`, async () => { for (const n of done) await post('/api/restore?name=' + q(n)); await refreshLib(); msg('restored'); });
}
async function renLib(n) {
  const base = n.replace(/\.[^.]+$/, ''), to = prompt('Rename photo', base); if (!to || to === base) return;
  const r = await post('/api/rename?from=' + q(n) + '&to=' + q(to)); if (!r.name) { msg('could not rename'); return; }
  delete imgCache[n]; if (state.src.kind === 'lib' && state.src.name === n) state.src.name = r.name; await refreshLib(); save();
}
function initLib() {
  const drop = $('#drop'), file = $('#file'); drop.onclick = () => file.click(); file.onchange = () => { addFiles(file.files); file.value = ''; };
  ['dragover', 'dragenter'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, () => drop.classList.remove('over')));
  window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
  window.addEventListener('paste', e => { const f = [...e.clipboardData.items].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean); if (f.length) addFiles(f); });
  $('#l-sel').onclick = () => { selMode = !selMode; if (!selMode) picked.clear(); updSel(); };
  $('#l-all').onclick = () => { lib.forEach(n => picked.add(n)); updSel(); };
  $('#l-del').onclick = () => { if (picked.size) delLib([...picked]); };
  $('#t-all').onclick = async () => { const tr = await (await fetch('/api/trash')).json(); for (const n of tr) await post('/api/restore?name=' + q(n)); await refreshLib(); msg(`restored ${tr.length}`); };
  initBank(); renderLib(); refreshTrash();
}

/* ---------- surprise: pick a look, a photo and a line of your own, the way you'd pick them ---------- */
function randomState(rnd, keep) {
  const st = defaultState(), ids = ['star', 'screen', 'xerox', 'terminal', 'still'], w = [.34, .2, .14, .14, .18]; let r = rnd(), id = ids[0];
  for (let i = 0; i < ids.length; i++) { if (r < w[i]) { id = ids[i]; break; } r -= w[i]; }
  st.style = id; st.seed = Math.floor(rnd() * 1e9); applyLook(st, pick(STYLES[id].looks, rnd));
  const P = st.p[id]; STYLES[id].schema.forEach(d => { if (d.t === 'r' && rnd() < .45) { const v = P[d.k] + (rnd() - .5) * (d.max - d.min) * .22; P[d.k] = clamp(Math.round(v / d.step) * d.step, d.min, d.max); } });
  const real = lib.filter(n => !n.startsWith('star_')), pool = rnd() < .8 && real.length ? real : lib;
  st.src = pool.length ? { kind: 'lib', name: pick(pool, rnd) } : { kind: 'none' };
  if (keep && keep.src.kind === 'user') st.src = keep.src;       // never swap away a photo you brought yourself
  st.photo = { zoom: 1 + rnd() * .7, px: (rnd() - .5) * .6, py: (rnd() - .5) * .6, flip: rnd() < .3 };
  if (bank.length) st.mood = pick(bank, rnd);
  return st;
}
async function surprise() { const line = pick(bank, Math.random); state = randomState(Math.random, state); if (line) state.mood = line; build(); drawBank(); schedule(); }

/* ---------- contact sheet ---------- */
let sheetSnaps = [];
async function sheetMore() {
  const grid = $('#sheetgrid'); grid.innerHTML = ''; sheetSnaps = [];
  const off = mk(S), oc = off.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < 8; i++) {
    const st = randomState(Math.random, state), t = mk(256); await renderState(oc, st); t.getContext('2d').drawImage(off, 0, 0, 256, 256);
    t.onclick = () => { state = st; $('#sheet').classList.remove('show'); build(); drawBank(); schedule(); }; grid.append(t); sheetSnaps.push(st);
    await new Promise(r => setTimeout(r, 0));
  }
}
$('#b-sheet').onclick = () => { $('#sheet').classList.add('show'); sheetMore(); };
$('#sheet-more').onclick = sheetMore; $('#sheet-close').onclick = () => $('#sheet').classList.remove('show');

/* ---------- export ---------- */
function slug() { return `${state.style}_${state.seed % 10000}`; }
function download(canvas, mime, name, q) { canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); msg(`saved ${name} (${Math.round(b.size / 1024)} KB)`); }, mime, q); }
$('#b-jpg').onclick = () => { const o = mk(640); const x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, 640, 640); download(o, 'image/jpeg', slug() + '.jpg', .93); };
$('#b-png').onclick = () => download(cv, 'image/png', slug() + '.png');
$('#b-copy').onclick = () => cv.toBlob(async b => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); msg('copied to clipboard'); } catch { msg('copy blocked by the browser: use download'); } });
$('#b-save').onclick = () => cv.toBlob(async b => { try { const r = await (await fetch('/api/save?name=' + encodeURIComponent(slug() + '.png'), { method: 'POST', body: b })).json(); msg('saved ' + r.saved); } catch { msg('could not save'); } }, 'image/png');
$('#b-surp').onclick = surprise; $('#b-seed').onclick = () => { state.seed = Math.floor(Math.random() * 1e9); schedule(); };
window.addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 's') surprise(); else if (e.key === 'r') $('#b-seed').click(); else if (e.key === 'd') $('#b-jpg').click(); });

/* ---------- draggable panel borders ---------- */
(function splitters() {
  const root = document.documentElement, main = $('main'), DEF = { lw: 330, rw: 300 }, MIN = 200, MAX = 640;
  let P = { ...DEF }; try { Object.assign(P, JSON.parse(localStorage.getItem('coverlab.panels') || '{}')); } catch { }
  const apply = () => { root.style.setProperty('--lw', P.lw + 'px'); root.style.setProperty('--rw', P.rw + 'px'); };
  const save = () => { try { localStorage.setItem('coverlab.panels', JSON.stringify(P)); } catch { } };
  const limit = (v, other) => clamp(v, MIN, Math.max(MIN, Math.min(MAX, innerWidth - other - 340)));      // always leave room for the cover
  apply();
  function wire(el, key) {
    const other = () => key === 'lw' ? P.rw : P.lw;
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); el.classList.add('drag'); document.body.classList.add('dragging'); e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (!el.hasPointerCapture(e.pointerId)) return; const r = main.getBoundingClientRect(); P[key] = limit(key === 'lw' ? e.clientX - r.left : r.right - e.clientX, other()); apply(); });
    const up = () => { el.classList.remove('drag'); document.body.classList.remove('dragging'); save(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', () => { P[key] = DEF[key]; apply(); save(); });
    el.addEventListener('keydown', e => { const d = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0; if (!d) return; e.preventDefault(); P[key] = limit(P[key] + (key === 'lw' ? d : -d), other()); apply(); save(); });
  }
  wire($('#sp-l'), 'lw'); wire($('#sp-r'), 'rw');
  window.addEventListener('resize', () => { P.lw = limit(P.lw, P.rw); P.rw = limit(P.rw, P.lw); apply(); });
})();

/* ---------- persistence + boot ---------- */
function save() { try { const s = clone(state); if (s.src.kind === 'user') s.src = { kind: 'none' }; localStorage.setItem('coverlab.v1', JSON.stringify(s)); } catch { } }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('coverlab.v1') || 'null'); if (!s || !STYLES[s.style]) return;
    const d = defaultState(); state = { ...d, ...s, photo: { ...d.photo, ...s.photo }, fx: { ...d.fx, ...s.fx }, p: d.p };
    for (const id in d.p) Object.assign(state.p[id], s.p && s.p[id]);
  } catch { }
}
(async function boot() {
  try { lib = await (await fetch('/api/inspo')).json(); } catch { lib = []; }
  try { bank = JSON.parse(localStorage.getItem('coverlab.bank') || 'null'); } catch { }
  if (!bank || !bank.length) bank = BANK0.split('\n');
  load(); if (state.src.kind === 'lib' && !lib.includes(state.src.name)) state.src = lib.length ? { kind: 'lib', name: lib[0] } : { kind: 'none' };
  if (state.src.kind === 'none' && !localStorage.getItem('coverlab.v1') && lib.length) state.src = { kind: 'lib', name: lib[0] };   // first run: start with the newest photo
  initLib(); build(); drawBank(); schedule();
})();
