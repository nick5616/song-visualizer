// Helpers
function lerp(a, b, t) { return a + (b - a) * t; }
function avg(arr, s, e) {
  let sum = 0;
  for (let i = s; i < e; i++) sum += arr[i];
  return sum / (e - s);
}

const palettes = {
  cyber:  ['#00ffaa', '#00ccff', '#ff2d6e', '#ff77aa'],
  fire:   ['#ff6b00', '#ffdd00', '#ff3300', '#ff9900'],
  ice:    ['#00c8ff', '#a64dff', '#ffffff', '#4dffd0'],
  mono:   ['#ffffff', '#cccccc', '#888888', '#444444'],
  sunset: ['#ff6ec7', '#ffb347', '#ff8c00', '#e040fb'],
  matrix: ['#00ff41', '#00cc33', '#88ff88', '#003300'],
};

function getPalette() { return palettes[palette]; }
function rndColor() {
  const p = getPalette();
  return p[Math.floor(Math.random() * p.length)];
}

// ---- Particles ----
const MAX_PARTICLES = 600;
let particles = [];

function spawnParticle(b) {
  const spd = params.speed / 50;
  const dens = params.density / 40;
  const count = Math.floor((b.bass * 5 + b.mid * 4 + b.high * 3) * dens + 1);
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vel = (0.5 + b.bass * 3 + b.mid * 1.5 + Math.random() * 2) * spd;
    particles.push({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H / 2 + (Math.random() - 0.5) * H * 0.3,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel,
      life: 1,
      decay: 0.008 + Math.random() * 0.015,
      size: 1.5 + b.bass * 5 + b.mid * 3 + Math.random() * 3,
      color: rndColor(),
      trail: [],
    });
  }
}

function drawParticles(b) {
  spawnParticle(b);
  const glow = params.glow / 100;
  ctx.save();
  if (glow > 0.3) ctx.shadowBlur = glow * 20;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.trail.push({ x: p.x, y: p.y });
    const trailMax = Math.floor(4 + b.high * 10);
    if (p.trail.length > trailMax) p.trail.shift();
    p.x += p.vx * (1 + b.bass * 1.5 + b.mid * 0.8);
    p.y += p.vy * (1 + b.bass * 1.5 + b.mid * 0.8);
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    if (p.trail.length > 1) {
      for (let j = 1; j < p.trail.length; j++) {
        const alpha = (j / p.trail.length) * p.life * 0.5;
        ctx.strokeStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = p.size * (j / p.trail.length) * 0.5;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.moveTo(p.trail[j - 1].x, p.trail[j - 1].y);
        ctx.lineTo(p.trail[j].x, p.trail[j].y);
        ctx.stroke();
      }
    }

    const alpha = Math.floor(p.life * 255).toString(16).padStart(2, '0');
    ctx.fillStyle = p.color + alpha;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- Waveform ----
function drawWaveform(b) {
  const p = getPalette();
  const cols = [p[0], p[1], p[2]];
  const offsets = [0, 20 + b.mid * 90, -(20 + b.high * 70)];
  const spd = params.speed / 50;
  const int = params.intensity / 50;

  for (let c = 0; c < cols.length; c++) {
    ctx.save();
    ctx.shadowBlur = params.glow * 0.4;
    ctx.shadowColor = cols[c];
    ctx.strokeStyle = cols[c] + (c === 0 ? 'ff' : '99');
    ctx.lineWidth = c === 0 ? 3 : 1.5;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const i = Math.floor((x / W) * 128);
      const amp = (freqSmooth[i] / 255) * H * 0.35 * int;
      const wave = Math.sin(x * 0.01 + t * spd * 2 + c * 1.2) * amp;
      const wave2 = Math.sin(x * 0.007 + t * spd * 1.5 + c) * amp * 0.5;
      const y = H / 2 + offsets[c] + wave + wave2;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Geometry ----
let geoAngle = 0;
function drawGeometry(b) {
  const p = getPalette();
  const int = params.intensity / 50;
  const spd = params.speed / 50;
  geoAngle += 0.005 * spd * (1 + b.bass * 2 + b.mid * 1.5);

  const shapes = Math.floor(3 + params.density / 20);
  const cx = W / 2, cy = H / 2;

  for (let s = 0; s < shapes; s++) {
    const phase = (s / shapes) * Math.PI * 2 + geoAngle;
    const radius = (80 + s * 60 + b.bass * 200) * int;
    const sides = 3 + s;
    const color = p[s % p.length];
    const alpha = 0.6 - s * 0.08;

    ctx.save();
    ctx.shadowBlur = params.glow * 0.5;
    ctx.shadowColor = color;
    ctx.strokeStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = 1.5 + b.bass * 3 + b.mid * 1.5;
    ctx.beginPath();
    for (let v = 0; v <= sides; v++) {
      const a = (v / sides) * Math.PI * 2 + phase;
      const perturbAmp = 0.06 + b.mid * 0.1 + b.high * 0.22;
      const r = radius * (1 + Math.sin(a * 3 + t * 0.05) * perturbAmp);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      v === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (b.bass > 0.4 || b.mid > 0.5) {
    const rays = 12;
    ctx.save();
    ctx.globalAlpha = b.bass * 0.5;
    ctx.strokeStyle = p[0];
    ctx.shadowColor = p[0];
    ctx.shadowBlur = 20;
    ctx.lineWidth = 1;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + geoAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * W * 0.7, cy + Math.sin(a) * H * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---- Tunnel ----
let tunnelRings = [];
function drawTunnel(b) {
  const p = getPalette();
  const spd = params.speed / 50;
  const int = params.intensity / 50;
  const cx = W / 2, cy = H / 2;

  if (t % Math.max(1, Math.floor(10 / spd)) === 0 || b.bass > 0.5 || b.high > 0.55) {
    tunnelRings.push({ r: 0, color: p[Math.floor(t / 10) % p.length], alpha: 1 });
  }

  tunnelRings.forEach((ring, i) => {
    ring.r += (2 + b.bass * 5 + b.mid * 3 + b.high * 1.5) * spd;
    ring.alpha = 1 - ring.r / (W * 0.8);
    if (ring.alpha <= 0) { tunnelRings.splice(i, 1); return; }

    ctx.save();
    ctx.shadowBlur = params.glow * 0.4;
    ctx.shadowColor = ring.color;
    ctx.strokeStyle = ring.color + Math.floor(ring.alpha * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = 1.5 + b.bass * 4 + b.mid * 2;
    const squish = 0.6 + b.mid * 0.3 + b.high * 0.15;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ring.r * int, ring.r * int * squish, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

// ---- Lissajous ----
function drawLissajous(b) {
  const p = getPalette();
  const spd = params.speed / 50;
  const int = params.intensity / 100;
  const cx = W / 2, cy = H / 2;
  const ax = (W * 0.4) * (0.5 + int * 0.5 + b.bass * 0.25 + b.high * 0.12);
  const ay = (H * 0.35) * (0.5 + int * 0.5 + b.mid * 0.28 + b.high * 0.1);
  const phaseDrift = b.high * 0.5;
  const freqX = 2 + Math.floor(params.density / 25);
  const freqY = 3 + Math.floor(params.density / 30);
  const steps = 500;

  for (let layer = 0; layer < 3; layer++) {
    const color = p[layer % p.length];
    const phaseOff = layer * 0.5;
    ctx.save();
    ctx.shadowBlur = params.glow * 0.4;
    ctx.shadowColor = color;
    ctx.strokeStyle = color + (layer === 0 ? 'cc' : '55');
    ctx.lineWidth = 1.5 - layer * 0.4;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      const x = cx + ax * Math.sin(freqX * theta + t * 0.008 * spd + phaseOff + phaseDrift);
      const y = cy + ay * Math.sin(freqY * theta + t * 0.006 * spd);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Spectrum Bars ----
function drawBars(b) {
  const p = getPalette();
  const barCount = Math.floor(20 + params.density * 0.6);
  const barW = W / barCount;
  const int = params.intensity / 50;
  const glow = params.glow / 100;

  for (let i = 0; i < barCount; i++) {
    const fi = Math.floor((i / barCount) * 128);
    const val = freqSmooth[fi] / 255;
    const barH = val * H * 0.8 * int;
    const color = p[i % p.length];

    ctx.save();
    ctx.shadowBlur = glow * 30;
    ctx.shadowColor = color;
    ctx.fillStyle = color + 'cc';
    ctx.fillRect(i * barW + 1, H / 2 - barH / 2, barW - 2, barH);

    if (barH > 4) {
      ctx.fillStyle = '#ffffff44';
      ctx.fillRect(i * barW + 1, H / 2 - barH / 2 - 3, barW - 2, 3);
      ctx.fillRect(i * barW + 1, H / 2 + barH / 2, barW - 2, 3);
    }
    ctx.restore();
  }
}

// ---- Background ----
function drawBackground(b) {
  switch (bg) {
    case 'trail': {
      const fade = 0.12 + (1 - params.intensity / 100) * 0.1;
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'black': {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'flash': {
      ctx.fillStyle = `rgba(0,0,0,${0.3 - b.bass * 0.25})`;
      ctx.fillRect(0, 0, W, H);
      if (b.bass > 0.6) {
        const p = getPalette();
        ctx.fillStyle = p[0] + '15';
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case 'color': {
      const p = getPalette();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, W, H);
      const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
      grad.addColorStop(0, p[0] + Math.floor(b.bass * 30).toString(16).padStart(2, '0'));
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      break;
    }
  }
}

function updateFreqBar(b) {
  const bar = document.getElementById('freqBar');
  bar.style.transform = `scaleX(${Math.min(1, b.total * 3)})`;
  bar.style.opacity = 0.2 + b.bass * 0.6;
}

// ---- Radial ----
function drawRadial(b) {
  const p = getPalette();
  const cx = W / 2, cy = H / 2;
  const barCount = Math.floor(60 + params.density * 2);
  const innerR = 55 + b.bass * 50;
  const maxLen = (H * 0.35) * (params.intensity / 50);
  const glow = params.glow / 100;
  const rotOff = t * 0.002 * (params.speed / 50);

  for (let i = 0; i < barCount; i++) {
    const fi = Math.floor((i / barCount) * 128);
    const val = freqSmooth[fi] / 255;
    const angle = (i / barCount) * Math.PI * 2 + rotOff - Math.PI / 2;
    const len = val * maxLen;
    const color = p[i % p.length];
    ctx.save();
    ctx.shadowBlur = glow * 25;
    ctx.shadowColor = color;
    ctx.strokeStyle = color + Math.floor((0.4 + val * 0.6) * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = Math.max(1.5, (2 * Math.PI * innerR / barCount) * 0.6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * (innerR + len), cy + Math.sin(angle) * (innerR + len));
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
  grad.addColorStop(0, p[0] + Math.floor(b.bass * 90).toString(16).padStart(2, '0'));
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- Helix ----
function drawHelix(b) {
  const p = getPalette();
  const spd = params.speed / 50;
  const int = params.intensity / 50;
  const cx = W / 2;
  const amp = W * 0.28 * int * (0.6 + b.bass * 0.4 + b.mid * 0.2);
  const turns = 3 + params.density / 40;
  const steps = 300;

  for (let strand = 0; strand < 2; strand++) {
    const phaseOff = strand * Math.PI;
    const color = p[strand % p.length];
    ctx.save();
    ctx.shadowBlur = params.glow * 0.4;
    ctx.shadowColor = color;
    ctx.strokeStyle = color + 'dd';
    ctx.lineWidth = 2 + b.bass * 3 + b.mid * 1.5;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const y = frac * H;
      const theta = frac * Math.PI * 2 * turns + t * 0.025 * spd + phaseOff;
      const fi = Math.floor(frac * 127);
      const ampMod = 0.7 + (freqSmooth[fi] / 255) * 0.6;
      const x = cx + Math.cos(theta) * amp * ampMod;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  const rungCount = Math.floor(turns * 14);
  for (let i = 0; i < rungCount; i++) {
    const frac = i / rungCount;
    const y = frac * H;
    const theta = frac * Math.PI * 2 * turns + t * 0.025 * spd;
    const fi = Math.floor(frac * 127);
    const ampMod = 0.7 + (freqSmooth[fi] / 255) * 0.6;
    const x1 = cx + Math.cos(theta) * amp * ampMod;
    const x2 = cx + Math.cos(theta + Math.PI) * amp * ampMod;
    const val = freqSmooth[fi] / 255;
    const color = p[(i + 1) % p.length];
    ctx.save();
    ctx.globalAlpha = 0.2 + val * 0.8;
    ctx.shadowBlur = params.glow * 0.3;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 + val * 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Starfield ----
const MAX_STARS = 350;
let stars = [];

function randomStar() {
  const p = getPalette();
  return {
    x: (Math.random() - 0.5) * W * 2.5,
    y: (Math.random() - 0.5) * H * 2.5,
    z: W,
    pz: W,
    color: p[Math.floor(Math.random() * p.length)],
  };
}

function drawStarfield(b) {
  if (stars.length === 0) {
    stars = Array.from({ length: MAX_STARS }, () => {
      const s = randomStar();
      s.z = Math.random() * W;
      s.pz = s.z;
      return s;
    });
  }
  const spd = params.speed / 50;
  const int = params.intensity / 50;
  const cx = W / 2, cy = H / 2;
  const speed = (1.5 + b.bass * 10 + b.mid * 5) * spd;

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    s.pz = s.z;
    s.z -= speed;
    if (s.z <= 0) { Object.assign(s, randomStar()); continue; }

    const sx = (s.x / s.z) * W * 0.5 + cx;
    const sy = (s.y / s.z) * H * 0.5 + cy;
    const px = (s.x / s.pz) * W * 0.5 + cx;
    const py = (s.y / s.pz) * H * 0.5 + cy;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) { Object.assign(s, randomStar()); continue; }

    const brightness = (1 - s.z / W) * int;
    ctx.save();
    ctx.shadowBlur = params.glow * 0.3;
    ctx.shadowColor = s.color;
    ctx.strokeStyle = s.color + Math.floor(brightness * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = Math.max(1, brightness * 3);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Terrain ----
const TERRAIN_ROWS = 36;
let terrainRows = [];
let terrainTick = 0;

function drawTerrain(b) {
  const p = getPalette();
  const int = params.intensity / 50;
  const spd = params.speed / 50;

  terrainTick++;
  if (terrainTick % Math.max(1, Math.floor(4 / spd)) === 0) {
    terrainRows.unshift(new Float32Array(freqSmooth));
    if (terrainRows.length > TERRAIN_ROWS) terrainRows.pop();
  }
  if (terrainRows.length === 0) return;

  const horizonY = H * 0.52;
  const maxBarH = H * 0.44 * int;
  const pts = 36;

  for (let r = terrainRows.length - 1; r >= 0; r--) {
    const row = terrainRows[r];
    const depth = r / (terrainRows.length - 1 || 1);
    const perspective = 1 - depth * 0.82;
    const rowW = W * perspective;
    const xOff = (W - rowW) / 2;
    const yBase = horizonY + (1 - depth) * (H - horizonY);
    const rowMaxH = maxBarH * perspective;
    const alpha = 0.1 + (1 - depth) * 0.9;
    const color = p[r % p.length];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = params.glow * 0.25 * (1 - depth);
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 + (1 - depth) * 2.5;
    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const fi = Math.floor((i / pts) * 127);
      const val = row[fi] / 255;
      const x = xOff + (i / pts) * rowW;
      const y = yBase - val * rowMaxH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Aurora ----
function drawAurora(b) {
  const p = getPalette();
  const spd = params.speed / 50;
  const int = params.intensity / 50;
  const layers = Math.floor(5 + params.density / 20);

  for (let layer = 0; layer < layers; layer++) {
    const fi = Math.floor((layer / layers) * 80);
    const val = freqSmooth[fi] / 255;
    const color = p[layer % p.length];
    const waveX = Math.sin(layer * 1.3 + t * 0.015 * spd) * W * 0.07;
    const x = W * (layer / layers) + waveX;
    const colW = (W / layers) * (0.55 + val * 0.9);
    const hFrac = 0.18 + val * 0.72 * int;
    const yTop = H * 0.02 + Math.sin(layer * 0.9 + t * 0.012 * spd) * H * 0.06;
    const curtainH = H * hFrac;
    const alpha = 0.07 + val * 0.55;
    const alphaHex = n => Math.floor(n * 255).toString(16).padStart(2, '0');

    const grad = ctx.createLinearGradient(0, yTop, 0, yTop + curtainH);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.12, color + alphaHex(alpha));
    grad.addColorStop(0.55, color + alphaHex(alpha * 0.65));
    grad.addColorStop(1, 'transparent');

    ctx.save();
    ctx.shadowBlur = params.glow * 0.8;
    ctx.shadowColor = color;
    ctx.fillStyle = grad;
    ctx.fillRect(x - colW * 0.15, yTop, colW, curtainH);
    ctx.restore();
  }
}

// ---- Kaleidoscope ----
function drawKaleidoscope(b) {
  const p = getPalette();
  const int = params.intensity / 50;
  const spd = params.speed / 50;
  const cx = W / 2, cy = H / 2;
  const segments = Math.max(4, Math.round(params.density / 12) * 2 + 4);
  const sliceAngle = (Math.PI * 2) / segments;
  const radius = Math.min(W, H) * 0.48;

  for (let s = 0; s < segments; s++) {
    const color = p[s % p.length];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s * sliceAngle);
    if (s % 2 === 1) ctx.scale(1, -1);
    ctx.shadowBlur = params.glow * 0.4;
    ctx.shadowColor = color;
    ctx.strokeStyle = color + 'aa';
    ctx.lineWidth = 1.5 + b.bass * 2.5;
    ctx.beginPath();
    const pts = 80;
    for (let i = 0; i <= pts; i++) {
      const fi = Math.floor((i / pts) * 64);
      const val = freqSmooth[fi] / 255;
      const r = (i / pts) * radius;
      const lateralOff = Math.sin(i * 0.22 + t * 0.03 * spd + s) * val * 35 * int;
      const x = Math.cos(val * 0.4 * int) * r;
      const y = Math.sin(val * 0.4 * int) * r + lateralOff;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Ripples ----
let ripples = [];

function drawRipples(b) {
  const p = getPalette();
  const int = params.intensity / 50;
  const spd = params.speed / 50;
  const cx = W / 2, cy = H / 2;

  if (b.bass > 0.42) {
    const count = Math.floor(1 + b.bass * 2 + b.mid);
    for (let i = 0; i < count && ripples.length < 80; i++) {
      ripples.push({
        r: 5 + i * 18,
        maxR: (100 + b.bass * 300 + Math.random() * 80) * int,
        color: p[Math.floor(Math.random() * p.length)],
        lw: 1.5 + b.bass * 3.5,
        spd: (0.8 + Math.random() * 0.8) * spd,
      });
    }
  }

  for (let i = ripples.length - 1; i >= 0; i--) {
    const rpl = ripples[i];
    rpl.r += (2.5 + b.mid * 2) * rpl.spd;
    const alpha = 1 - rpl.r / rpl.maxR;
    if (alpha <= 0) { ripples.splice(i, 1); continue; }
    ctx.save();
    ctx.shadowBlur = params.glow * 0.35;
    ctx.shadowColor = rpl.color;
    ctx.strokeStyle = rpl.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = rpl.lw * alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, rpl.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Guitar Hero ----
const GH_LANES = 5;
const GH_LOOKAHEAD = 2.6;   // seconds of future visible
const GH_LOOKBACK  = 3.2;   // seconds of past visible (reverse mode)
const GH_NOTE_DUR  = 0.18;  // note block height in seconds

function ghSongTime() {
  if (!audioCtx) return t / 60;
  if (fileAudioActive && fileStartedAt > 0) return audioCtx.currentTime - fileStartedAt;
  return fileOffset || 0;
}

function drawGuitarHero(b) {
  const p = getPalette();
  const int = params.intensity / 50;
  const cx = W / 2;
  const now = ghSongTime();

  // Highway geometry
  const horizonY  = H * 0.10;
  const fretY     = H * 0.80;
  const horizonW  = W * 0.13;
  const fretW     = W * 0.97;

  const roadW  = y => horizonW + (fretW  - horizonW)  * ((y - horizonY) / (fretY - horizonY));
  const roadL  = y => cx - roadW(y) / 2;
  const laneW  = y => roadW(y) / GH_LANES;
  const noteX  = (y, lane) => roadL(y) + lane * laneW(y);
  const yOfProg = prog => horizonY + prog * (fretY - horizonY);
  // prog 0 = horizon (future), prog 1 = fret (now)
  const progOfTime = dt => 1 - dt / GH_LOOKAHEAD;

  // ---- Highway background ----
  ctx.save();
  const hBg = ctx.createLinearGradient(0, horizonY, 0, fretY);
  hBg.addColorStop(0, '#04040e');
  hBg.addColorStop(1, '#080818');
  ctx.beginPath();
  ctx.moveTo(roadL(horizonY), horizonY);
  ctx.lineTo(roadL(horizonY) + horizonW, horizonY);
  ctx.lineTo(roadL(fretY) + fretW, fretY);
  ctx.lineTo(roadL(fretY), fretY);
  ctx.closePath();
  ctx.fillStyle = hBg;
  ctx.fill();
  ctx.restore();

  // ---- Lane fills (subtle alternating shading) ----
  for (let lane = 0; lane < GH_LANES; lane++) {
    if (lane % 2 === 0) continue;
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(noteX(horizonY, lane), horizonY);
    ctx.lineTo(noteX(horizonY, lane) + laneW(horizonY), horizonY);
    ctx.lineTo(noteX(fretY, lane)    + laneW(fretY),    fretY);
    ctx.lineTo(noteX(fretY, lane),   fretY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- Lane dividers ----
  for (let d = 0; d <= GH_LANES; d++) {
    const x0 = roadL(horizonY) + d * laneW(horizonY);
    const x1 = roadL(fretY)    + d * laneW(fretY);
    ctx.save();
    ctx.strokeStyle = '#ffffff12';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, horizonY);
    ctx.lineTo(x1, fretY);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Scrolling center dashes ----
  const dashCount = 10;
  const dashScroll = (now * 0.35) % 1;
  for (let d = 0; d < dashCount; d++) {
    const progA = ((d + dashScroll) / dashCount);
    const progB = ((d + dashScroll + 0.45) / dashCount);
    if (progA > 1 || progB < 0) continue;
    const yA = yOfProg(Math.min(1, progA));
    const yB = yOfProg(Math.min(1, progB));
    for (let lane = 1; lane < GH_LANES; lane++) {
      const xA = noteX(yA, lane);
      const xB = noteX(yB, lane);
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.03 + progA * 0.04})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xA, yA);
      ctx.lineTo(xB, yB);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- Collect notes to render ----
  const toRender = [];

  if (ghNotes && ghNotes.length > 0) {
    // Binary-search window [now - 0.3, now + GH_LOOKAHEAD + 0.1]
    const tLo = now - 0.3, tHi = now + GH_LOOKAHEAD + 0.1;
    let lo = 0, hi = ghNotes.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; ghNotes[m].time < tLo ? (lo = m + 1) : (hi = m); }
    for (let i = lo; i < ghNotes.length && ghNotes[i].time <= tHi; i++) toRender.push(ghNotes[i]);
  } else if (ghNotes === null) {
    // Live fallback: spawn notes from real-time band energy
    const BAND_BINS = [[0, 8], [8, 20], [20, 50], [50, 90], [90, 128]];
    const liveNow = t / 60;
    for (let bi = 0; bi < GH_LANES; bi++) {
      const [blo, bhi] = BAND_BINS[bi];
      const energy = avg(freqSmooth, blo, bhi) / 255;
      ghBandSmooth[bi] = lerp(ghBandSmooth[bi], energy, 0.15);
      const thresh = Math.max(0.18, ghBandSmooth[bi] * 1.35);
      if (energy > thresh && liveNow - ghLastLiveSpawn[bi] > 0.13) {
        ghLiveNotes.push({
          time: liveNow + GH_LOOKAHEAD,
          lane: bi,
          intensity: Math.min(1, (energy - thresh) / 0.5),
          big: energy > thresh * 1.5,
        });
        ghLastLiveSpawn[bi] = liveNow;
      }
    }
    // Prune old live notes
    const cutoff = liveNow - GH_NOTE_DUR * 3;
    while (ghLiveNotes.length && ghLiveNotes[0].time < cutoff) ghLiveNotes.shift();
    const liveWindow = ghLiveNotes.filter(n => {
      const dt = n.time - liveNow;
      return dt > -GH_NOTE_DUR * 2 && dt < GH_LOOKAHEAD + 0.1;
    });
    toRender.push(...liveWindow);
  }

  // ---- Draw notes ----
  const h2x = n => Math.floor(n * 255).toString(16).padStart(2, '0');

  for (const note of toRender) {
    const refTime = ghNotes ? now : t / 60;
    const dt = note.time - refTime;
    const dur = GH_NOTE_DUR * (note.big ? 2.2 : 1);
    const progTop = progOfTime(dt + dur);
    const progBot = progOfTime(dt);

    if (progBot < -0.05 || progTop > 1.05) continue;

    const yT = yOfProg(Math.max(-0.05, Math.min(1, progTop)));
    const yB = yOfProg(Math.max(0, Math.min(1.05, progBot)));
    if (yB - yT < 2) continue;

    const yMid = (yT + yB) / 2;
    const nX = noteX(yMid, note.lane);
    const nW = laneW(yMid) * 0.82;
    const color = p[note.lane % p.length];
    const alpha = (0.55 + note.intensity * 0.45) * int;
    const r = Math.min(nW * 0.22, (yB - yT) * 0.35, 7);

    ctx.save();
    ctx.shadowBlur = params.glow * 0.55;
    ctx.shadowColor = color;

    const ng = ctx.createLinearGradient(nX, yT, nX, yB);
    ng.addColorStop(0,   color + h2x(alpha * 0.45));
    ng.addColorStop(0.25, color + h2x(alpha));
    ng.addColorStop(0.75, color + h2x(alpha));
    ng.addColorStop(1,   color + h2x(alpha * 0.45));
    ctx.fillStyle = ng;

    ctx.beginPath();
    ctx.moveTo(nX + r, yT);
    ctx.lineTo(nX + nW - r, yT);
    ctx.arcTo(nX + nW, yT,  nX + nW, yT + r, r);
    ctx.lineTo(nX + nW, yB - r);
    ctx.arcTo(nX + nW, yB,  nX + nW - r, yB, r);
    ctx.lineTo(nX + r, yB);
    ctx.arcTo(nX, yB,  nX, yB - r, r);
    ctx.lineTo(nX, yT + r);
    ctx.arcTo(nX, yT,  nX + r, yT, r);
    ctx.closePath();
    ctx.fill();

    // Top highlight stripe
    ctx.fillStyle = '#ffffff' + h2x(0.18 + note.intensity * 0.15);
    ctx.fillRect(nX + r, yT, nW - r * 2, Math.min(3, (yB - yT) * 0.15));
    ctx.restore();
  }

  // ---- Fret buttons ----
  const fretBtnY = H * 0.875;
  const fretBtnR = laneW(fretY) * 0.36;

  for (let lane = 0; lane < GH_LANES; lane++) {
    const bx = noteX(fretY, lane) + laneW(fretY) * 0.5;
    const color = p[lane % p.length];
    const refTime = ghNotes ? now : t / 60;

    // How close is the nearest note to the fret line?
    let hit = 0;
    for (const n of toRender) {
      if (n.lane !== lane) continue;
      const dist = Math.abs(n.time - refTime);
      if (dist < 0.18) hit = Math.max(hit, 1 - dist / 0.18);
    }
    // Also react to live audio in this band
    const BAND_BINS = [[0, 8], [8, 20], [20, 50], [50, 90], [90, 128]];
    const liveVal = avg(freqSmooth, ...BAND_BINS[lane]) / 255;
    const glow = Math.max(hit, liveVal * 0.45);

    ctx.save();
    ctx.shadowBlur = 15 + glow * 35;
    ctx.shadowColor = color;

    // Outer ring
    ctx.strokeStyle = color + Math.floor((0.35 + glow * 0.65) * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = 2 + glow * 3;
    ctx.beginPath();
    ctx.arc(bx, fretBtnY, fretBtnR, 0, Math.PI * 2);
    ctx.stroke();

    // Fill on hit
    if (glow > 0.08) {
      ctx.fillStyle = color + Math.floor(glow * 0.55 * 255).toString(16).padStart(2, '0');
      ctx.beginPath();
      ctx.arc(bx, fretBtnY, fretBtnR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center dot
    ctx.fillStyle = color + Math.floor((0.3 + glow * 0.7) * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(bx, fretBtnY, fretBtnR * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- Fret line ----
  ctx.save();
  ctx.strokeStyle = '#ffffff28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(roadL(fretY), fretY);
  ctx.lineTo(roadL(fretY) + fretW, fretY);
  ctx.stroke();

  // Glow the fret line with total energy
  ctx.strokeStyle = p[0] + Math.floor(b.total * 80).toString(16).padStart(2, '0');
  ctx.lineWidth = 3 + b.bass * 6;
  ctx.shadowBlur = params.glow * 0.4;
  ctx.shadowColor = p[0];
  ctx.beginPath();
  ctx.moveTo(roadL(fretY), fretY);
  ctx.lineTo(roadL(fretY) + fretW, fretY);
  ctx.stroke();
  ctx.restore();

  // ---- Horizon glow ----
  ctx.save();
  const hGrad = ctx.createRadialGradient(cx, horizonY, 0, cx, horizonY, W * 0.5);
  hGrad.addColorStop(0, p[1] + Math.floor(b.mid * 40).toString(16).padStart(2, '0'));
  hGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, horizonY - 30, W, 80);
  ctx.restore();

  // ---- Analyzing overlay ----
  if (ghNotes === null && !fileAudioActive) {
    ctx.save();
    ctx.fillStyle = '#ffffff18';
    ctx.font = `12px 'Space Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('load a track to analyze', cx, H * 0.5);
    ctx.restore();
  }
}

function drawGuitarHeroReverse(b) {
  const p = getPalette();
  const int = params.intensity / 50;
  const cx = W / 2;
  const now = ghSongTime();

  const horizonY = H * 0.10;
  const fretY    = H * 0.80;
  const horizonW = W * 0.13;
  const fretW    = W * 0.97;

  const roadW  = y => horizonW + (fretW - horizonW) * ((y - horizonY) / (fretY - horizonY));
  const roadL  = y => cx - roadW(y) / 2;
  const laneW  = y => roadW(y) / GH_LANES;
  const noteX  = (y, lane) => roadL(y) + lane * laneW(y);
  const yOfProg = prog => horizonY + prog * (fretY - horizonY);
  // prog 0 = horizon (oldest visible past), prog 1 = fret (just happened)
  const progOfPast = dt_past => 1 - dt_past / GH_LOOKBACK;

  // Highway background
  ctx.save();
  const hBg = ctx.createLinearGradient(0, horizonY, 0, fretY);
  hBg.addColorStop(0, '#04040e');
  hBg.addColorStop(1, '#080818');
  ctx.beginPath();
  ctx.moveTo(roadL(horizonY), horizonY);
  ctx.lineTo(roadL(horizonY) + horizonW, horizonY);
  ctx.lineTo(roadL(fretY) + fretW, fretY);
  ctx.lineTo(roadL(fretY), fretY);
  ctx.closePath();
  ctx.fillStyle = hBg;
  ctx.fill();
  ctx.restore();

  for (let lane = 0; lane < GH_LANES; lane++) {
    if (lane % 2 === 0) continue;
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(noteX(horizonY, lane), horizonY);
    ctx.lineTo(noteX(horizonY, lane) + laneW(horizonY), horizonY);
    ctx.lineTo(noteX(fretY, lane) + laneW(fretY), fretY);
    ctx.lineTo(noteX(fretY, lane), fretY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (let d = 0; d <= GH_LANES; d++) {
    ctx.save();
    ctx.strokeStyle = '#ffffff12';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(roadL(horizonY) + d * laneW(horizonY), horizonY);
    ctx.lineTo(roadL(fretY) + d * laneW(fretY), fretY);
    ctx.stroke();
    ctx.restore();
  }

  // Scrolling dashes (upward direction)
  const dashCount = 10;
  const dashScroll = 1 - (now * 0.35) % 1;
  for (let d = 0; d < dashCount; d++) {
    const progA = ((d + dashScroll) / dashCount);
    const progB = ((d + dashScroll + 0.45) / dashCount);
    if (progA > 1 || progB < 0) continue;
    const yA = yOfProg(Math.min(1, progA));
    const yB2 = yOfProg(Math.min(1, progB));
    for (let lane = 1; lane < GH_LANES; lane++) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.03 + progA * 0.04})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(noteX(yA, lane), yA);
      ctx.lineTo(noteX(yB2, lane), yB2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- Collect notes to render ----
  const toRender = [];

  if (ghNotes && ghNotes.length > 0) {
    const tLo = now - GH_LOOKBACK - GH_NOTE_DUR;
    const tHi = now + GH_NOTE_DUR;
    let lo = 0, hi = ghNotes.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; ghNotes[m].time < tLo ? (lo = m + 1) : (hi = m); }
    for (let i = lo; i < ghNotes.length && ghNotes[i].time <= tHi; i++) toRender.push(ghNotes[i]);
  } else if (ghNotes === null) {
    const liveNow = t / 60;
    const BAND_BINS = [[0, 8], [8, 20], [20, 50], [50, 90], [90, 128]];
    for (let bi = 0; bi < GH_LANES; bi++) {
      const [blo, bhi] = BAND_BINS[bi];
      const energy = avg(freqSmooth, blo, bhi) / 255;
      ghBandSmooth[bi] = lerp(ghBandSmooth[bi], energy, 0.15);
      const thresh = Math.max(0.18, ghBandSmooth[bi] * 1.35);
      if (energy > thresh && liveNow - ghLastLiveSpawn[bi] > 0.13) {
        ghLiveNotes.push({
          time: liveNow,
          lane: bi,
          intensity: Math.min(1, (energy - thresh) / 0.5),
          big: energy > thresh * 1.5,
        });
        ghLastLiveSpawn[bi] = liveNow;
      }
    }
    const cutoff = liveNow - GH_LOOKBACK - GH_NOTE_DUR;
    while (ghLiveNotes.length && ghLiveNotes[0].time < cutoff) ghLiveNotes.shift();
    const liveWindow = ghLiveNotes.filter(n => n.time <= liveNow && n.time >= cutoff);
    toRender.push(...liveWindow);
  }

  // ---- Draw notes ----
  const h2x = n => Math.floor(n * 255).toString(16).padStart(2, '0');
  const refTime = ghNotes ? now : t / 60;

  for (const note of toRender) {
    const dt_past = refTime - note.time;
    const dur = GH_NOTE_DUR * (note.big ? 2.2 : 1);
    const progTop = progOfPast(dt_past);
    const progBot = progOfPast(dt_past - dur);

    if (progTop < -0.05 || progBot > 1.05) continue;

    const yT = yOfProg(Math.max(-0.05, Math.min(1, progTop)));
    const yB = yOfProg(Math.max(0, Math.min(1.05, progBot)));
    if (yB - yT < 2) continue;

    const yMid = (yT + yB) / 2;
    const nX = noteX(yMid, note.lane);
    const nW = laneW(yMid) * 0.82;
    const color = p[note.lane % p.length];
    const alpha = (0.55 + note.intensity * 0.45) * int;
    const r = Math.min(nW * 0.22, (yB - yT) * 0.35, 7);

    ctx.save();
    ctx.shadowBlur = params.glow * 0.55;
    ctx.shadowColor = color;

    const ng = ctx.createLinearGradient(nX, yT, nX, yB);
    ng.addColorStop(0,    color + h2x(alpha * 0.45));
    ng.addColorStop(0.25, color + h2x(alpha));
    ng.addColorStop(0.75, color + h2x(alpha));
    ng.addColorStop(1,    color + h2x(alpha * 0.45));
    ctx.fillStyle = ng;

    ctx.beginPath();
    ctx.moveTo(nX + r, yT);
    ctx.lineTo(nX + nW - r, yT);
    ctx.arcTo(nX + nW, yT,  nX + nW, yT + r, r);
    ctx.lineTo(nX + nW, yB - r);
    ctx.arcTo(nX + nW, yB,  nX + nW - r, yB, r);
    ctx.lineTo(nX + r, yB);
    ctx.arcTo(nX, yB,  nX, yB - r, r);
    ctx.lineTo(nX, yT + r);
    ctx.arcTo(nX, yT,  nX + r, yT, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff' + h2x(0.18 + note.intensity * 0.15);
    ctx.fillRect(nX + r, yT, nW - r * 2, Math.min(3, (yB - yT) * 0.15));
    ctx.restore();
  }

  // ---- Fret buttons ----
  const fretBtnY = H * 0.875;
  const fretBtnR = laneW(fretY) * 0.36;
  const BAND_BINS2 = [[0, 8], [8, 20], [20, 50], [50, 90], [90, 128]];

  for (let lane = 0; lane < GH_LANES; lane++) {
    const bx = noteX(fretY, lane) + laneW(fretY) * 0.5;
    const color = p[lane % p.length];

    let hit = 0;
    for (const n of toRender) {
      if (n.lane !== lane) continue;
      const dist = Math.abs(n.time - refTime);
      if (dist < 0.18) hit = Math.max(hit, 1 - dist / 0.18);
    }
    const liveVal = avg(freqSmooth, ...BAND_BINS2[lane]) / 255;
    const glow = Math.max(hit, liveVal * 0.45);

    ctx.save();
    ctx.shadowBlur = 15 + glow * 35;
    ctx.shadowColor = color;
    ctx.strokeStyle = color + Math.floor((0.35 + glow * 0.65) * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = 2 + glow * 3;
    ctx.beginPath();
    ctx.arc(bx, fretBtnY, fretBtnR, 0, Math.PI * 2);
    ctx.stroke();
    if (glow > 0.08) {
      ctx.fillStyle = color + Math.floor(glow * 0.55 * 255).toString(16).padStart(2, '0');
      ctx.beginPath();
      ctx.arc(bx, fretBtnY, fretBtnR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color + Math.floor((0.3 + glow * 0.7) * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(bx, fretBtnY, fretBtnR * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- Fret line ----
  ctx.save();
  ctx.strokeStyle = '#ffffff28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(roadL(fretY), fretY);
  ctx.lineTo(roadL(fretY) + fretW, fretY);
  ctx.stroke();
  ctx.strokeStyle = p[0] + Math.floor(b.total * 80).toString(16).padStart(2, '0');
  ctx.lineWidth = 3 + b.bass * 6;
  ctx.shadowBlur = params.glow * 0.4;
  ctx.shadowColor = p[0];
  ctx.beginPath();
  ctx.moveTo(roadL(fretY), fretY);
  ctx.lineTo(roadL(fretY) + fretW, fretY);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const hGrad = ctx.createRadialGradient(cx, horizonY, 0, cx, horizonY, W * 0.5);
  hGrad.addColorStop(0, p[1] + Math.floor(b.mid * 40).toString(16).padStart(2, '0'));
  hGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, horizonY - 30, W, 80);
  ctx.restore();

  if (ghNotes === null && !fileAudioActive) {
    ctx.save();
    ctx.fillStyle = '#ffffff18';
    ctx.font = `12px 'Space Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('load a track to analyze', cx, H * 0.5);
    ctx.restore();
  }
}

// ---- Vortex ----
let vortexAngle = 0;

function drawVortex(b) {
  const p = getPalette();
  const spd = params.speed / 50;
  const int = params.intensity / 50;
  const cx = W / 2, cy = H / 2;
  const lineCount = Math.floor(24 + params.density);
  const maxLen = Math.min(W, H) * 0.52 * int;

  vortexAngle += 0.008 * spd * (1 + b.bass * 4 + b.mid * 1.5);

  for (let i = 0; i < lineCount; i++) {
    const fi = Math.floor((i / lineCount) * 128);
    const val = freqSmooth[fi] / 255;
    const base = (i / lineCount) * Math.PI * 2 + vortexAngle;
    const twist = val * Math.PI * 0.7 * (1 + b.bass * 0.5);
    const len = 30 + val * (maxLen - 30);
    const color = p[i % p.length];
    const alpha = 0.2 + val * 0.8;
    ctx.save();
    ctx.shadowBlur = params.glow * 0.35;
    ctx.shadowColor = color;
    ctx.strokeStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = 1 + val * 3 + b.bass * 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(base + twist) * len, cy + Math.sin(base + twist) * len);
    ctx.stroke();
    ctx.restore();
  }
}
