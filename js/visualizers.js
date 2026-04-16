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
  const count = Math.floor(b.bass * 8 * dens + b.mid * 3 * dens + 1);
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vel = (0.5 + b.bass * 4 + Math.random() * 2) * spd;
    particles.push({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H / 2 + (Math.random() - 0.5) * H * 0.3,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel,
      life: 1,
      decay: 0.008 + Math.random() * 0.015,
      size: 1.5 + b.bass * 8 + Math.random() * 3,
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
    if (p.trail.length > 6) p.trail.shift();
    p.x += p.vx * (1 + b.bass * 2);
    p.y += p.vy * (1 + b.bass * 2);
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
  const offsets = [0, 20, -20];
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
  geoAngle += 0.005 * spd * (1 + b.bass * 3);

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
    ctx.lineWidth = 2 + b.bass * 4;
    ctx.beginPath();
    for (let v = 0; v <= sides; v++) {
      const a = (v / sides) * Math.PI * 2 + phase;
      const r = radius * (1 + Math.sin(a * 3 + t * 0.05) * 0.1 * b.mid);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      v === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (b.bass > 0.4) {
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

  if (t % Math.max(1, Math.floor(10 / spd)) === 0 || b.bass > 0.5) {
    tunnelRings.push({ r: 0, color: p[Math.floor(t / 10) % p.length], alpha: 1 });
  }

  tunnelRings.forEach((ring, i) => {
    ring.r += (2 + b.bass * 8) * spd;
    ring.alpha = 1 - ring.r / (W * 0.8);
    if (ring.alpha <= 0) { tunnelRings.splice(i, 1); return; }

    ctx.save();
    ctx.shadowBlur = params.glow * 0.4;
    ctx.shadowColor = ring.color;
    ctx.strokeStyle = ring.color + Math.floor(ring.alpha * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = 2 + b.bass * 6;
    const squish = 0.6 + b.mid * 0.4;
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
  const ax = (W * 0.4) * (0.5 + int * 0.5 + b.bass * 0.3);
  const ay = (H * 0.35) * (0.5 + int * 0.5 + b.mid * 0.3);
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
      const x = cx + ax * Math.sin(freqX * theta + t * 0.008 * spd + phaseOff);
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
