// Procedural canvas textures: every surface in the city is painted in code,
// so the game ships no image files. All variation comes from a seeded RNG,
// which keeps the look identical for a given seed.
import * as THREE from 'three';
import { RNG } from '../random.js';

export function makeTextures() {
  const rng = new RNG(7);

  const canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
  };
  const toTexture = (c, repeatX = 1, repeatY = 1) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  // Office tower facade: window grid with a few lit panes.
  const [facadeC, f] = canvas(256, 256);
  f.fillStyle = '#8b9aa8';
  f.fillRect(0, 0, 256, 256);
  for (let y = 8; y < 248; y += 24) {
    for (let x = 8; x < 248; x += 24) {
      const lit = rng.chance(0.22);
      f.fillStyle = lit ? '#ffd98a' : (rng.chance(0.5) ? '#2b3a4a' : '#35485c');
      f.fillRect(x, y, 16, 14);
    }
  }

  // Brick facade for Old Town: warm courses with subtle variation.
  const [brickC, b] = canvas(256, 256);
  b.fillStyle = '#9c6644';
  b.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    const offset = (y / 16) % 2 === 0 ? 0 : 16;
    for (let x = -16 + offset; x < 256; x += 32) {
      b.fillStyle = rng.chance(0.5) ? '#a9714e' : '#8f5a38';
      b.fillRect(x + 1, y + 1, 30, 14);
    }
  }
  b.fillStyle = '#3a2a20';
  for (let y = 20; y < 240; y += 64) {
    for (let x = 20; x < 240; x += 64) b.fillRect(x, y, 24, 36);
  }

  // Asphalt with a dashed centre line and worn edges.
  const [roadC, r] = canvas(128, 128);
  r.fillStyle = '#33373c';
  r.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    r.fillStyle = rng.chance(0.5) ? '#2b2f33' : '#3d4147';
    r.fillRect(rng.int(0, 127), rng.int(0, 127), 2, 2);
  }
  r.fillStyle = '#e8c33c';
  r.fillRect(62, 0, 4, 40);
  r.fillRect(62, 64, 4, 40);
  r.fillStyle = '#d8d8d8';
  r.fillRect(2, 0, 2, 128);
  r.fillRect(124, 0, 2, 128);

  // Pavement slabs.
  const [walkC, w] = canvas(128, 128);
  w.fillStyle = '#9a938a';
  w.fillRect(0, 0, 128, 128);
  w.strokeStyle = '#7e7770';
  w.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    w.beginPath(); w.moveTo(i, 0); w.lineTo(i, 128); w.stroke();
    w.beginPath(); w.moveTo(0, i); w.lineTo(128, i); w.stroke();
  }

  // Beach sand with soft speckles.
  const [sandC, s] = canvas(256, 256);
  s.fillStyle = '#e8d3a0';
  s.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    s.fillStyle = rng.pick(['#dcc183', '#f2e2b3', '#cbb271']);
    s.fillRect(rng.int(0, 255), rng.int(0, 255), 2, 2);
  }

  // Water surface: deep teal with lighter wave streaks.
  const [waterC, wa] = canvas(256, 256);
  wa.fillStyle = '#1b6f7d';
  wa.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    wa.strokeStyle = rng.chance(0.5) ? '#2a8a99' : '#155a66';
    wa.lineWidth = rng.range(1, 3);
    const y = rng.int(0, 255);
    wa.beginPath();
    wa.moveTo(rng.int(0, 200), y);
    wa.bezierCurveTo(80, y + rng.range(-8, 8), 170, y + rng.range(-8, 8), 256, y);
    wa.stroke();
  }

  // Caustics: dancing light cells painted as overlapping bright rings.
  const [causticC, ca] = canvas(256, 256);
  ca.fillStyle = '#000000';
  ca.fillRect(0, 0, 256, 256);
  ca.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const x = rng.int(0, 255);
    const y = rng.int(0, 255);
    const rad = rng.range(14, 42);
    const g = ca.createRadialGradient(x, y, rad * 0.4, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,220,0)');
    g.addColorStop(0.75, 'rgba(255,250,200,0.55)');
    g.addColorStop(1, 'rgba(255,255,220,0)');
    ca.fillStyle = g;
    ca.beginPath();
    ca.arc(x, y, rad, 0, Math.PI * 2);
    ca.fill();
  }

  // Warehouse corrugated metal.
  const [metalC, m] = canvas(128, 128);
  m.fillStyle = '#7a8a94';
  m.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    m.fillStyle = (x / 8) % 2 === 0 ? '#8696a0' : '#6e7e88';
    m.fillRect(x, 0, 8, 128);
  }
  m.fillStyle = '#5a6a74';
  m.fillRect(0, 100, 128, 28);

  return {
    facade: toTexture(facadeC, 2, 3),
    brick: toTexture(brickC, 2, 2),
    road: toTexture(roadC, 1, 8),
    sidewalk: toTexture(walkC, 8, 8),
    sand: toTexture(sandC, 12, 4),
    water: toTexture(waterC, 8, 8),
    caustics: toTexture(causticC, 6, 6),
    metal: toTexture(metalC, 3, 1),
  };
}

// Soft radial blob shadow used under the player, vehicles, pedestrians and
// hostiles. Cheap, always aligned to the ground, no shadow-map cost.
export function makeBlobShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Text sign texture for shop fronts and landmarks (drawn, not loaded).
export function makeSignTexture(label, bg = '#1a2a3a', fg = '#ffd98a') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
