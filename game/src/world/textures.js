// Procedural canvas textures for Solmar City: zero bytes of image files, everything
// drawn at load from the city seed. Facade textures are square modules (12 m x 12 m)
// tiled across building faces by the UV-scaling shader patch in world/city.js.

import * as THREE from 'three';

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, repeat = false) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

/** Speckle noise over a filled canvas: cheap asphalt / concrete / grass grain. */
function speckle(ctx, w, h, rng, count, colors, size = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = 0.12 + rng() * 0.25;
    const s = 1 + rng() * size;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/**
 * Building facade: one 12 m x 12 m module with a 6x6 window grid (2 m per
 * window). The wall is kept near-white so per-instance tint colours show
 * through; windows are dark glass, a few lit warm. Returns { map, emissiveMap }
 * — the emissive map is black except for the same lit windows, so nights glow
 * without re-drawing anything.
 */
export function makeFacadeTexture(rng, opts = {}) {
  const cols = opts.cols || 6;
  const rows = opts.rows || 6;
  const litRatio = opts.litRatio ?? 0.22;
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const [eCanvas, ectx] = makeCanvas(size, size);
  ctx.fillStyle = '#d9dde2';
  ctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, size, size);
  const cw = size / cols;
  const ch = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.18;
      const y = r * ch + ch * 0.2;
      const w = cw * 0.64;
      const h = ch * 0.6;
      const lit = rng() < litRatio;
      // Frame.
      ctx.fillStyle = '#8b939e';
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      if (lit) {
        ctx.fillStyle = '#ffd98a';
        ctx.fillRect(x, y, w, h);
        ectx.fillStyle = '#ffbe55';
        ectx.fillRect(x, y, w, h);
      } else {
        const shade = 38 + Math.floor(rng() * 30);
        ctx.fillStyle = `rgb(${shade - 8},${shade + 6},${shade + 22})`;
        ctx.fillRect(x, y, w, h);
        // Glass highlight diagonal.
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w * 0.45, y);
        ctx.lineTo(x + w * 0.75, y);
        ctx.lineTo(x + w * 0.3, y + h);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  // Subtle floor slab lines.
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (let r = 1; r < rows; r++) ctx.fillRect(0, r * ch - 1, size, 2);
  return { map: toTexture(canvas, true), emissiveMap: toTexture(eCanvas, true) };
}

/**
 * Warehouse / shophouse facade: fewer, wider windows and a ground-floor band
 * (shopfront / roller door) along the bottom of the module.
 */
export function makeLowFacadeTexture(rng, opts = {}) {
  const cols = opts.cols || 4;
  const rows = opts.rows || 3;
  const litRatio = opts.litRatio ?? 0.3;
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const [eCanvas, ectx] = makeCanvas(size, size);
  ctx.fillStyle = '#e2ddd2';
  ctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, size, size);
  const cw = size / cols;
  const ch = (size * 0.62) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.16;
      const y = r * ch + ch * 0.22;
      const w = cw * 0.68;
      const h = ch * 0.56;
      const lit = rng() < litRatio;
      ctx.fillStyle = '#7d7468';
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      if (lit) {
        ctx.fillStyle = '#ffd98a';
        ctx.fillRect(x, y, w, h);
        ectx.fillStyle = '#ffbe55';
        ectx.fillRect(x, y, w, h);
      } else {
        const shade = 42 + Math.floor(rng() * 26);
        ctx.fillStyle = `rgb(${shade},${shade + 8},${shade + 20})`;
        ctx.fillRect(x, y, w, h);
      }
    }
  }
  // Ground-floor band: shopfront glass or roller door slats.
  const bandY = size * 0.62;
  ctx.fillStyle = '#6d675e';
  ctx.fillRect(0, bandY, size, size - bandY);
  if (opts.shopfront !== false) {
    ctx.fillStyle = rng() < 0.5 ? '#2c3e50' : '#3a2f28';
    ctx.fillRect(6, bandY + 8, size - 12, size - bandY - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(6, bandY + 8, size - 12, 10);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let y = bandY + 6; y < size - 4; y += 9) ctx.fillRect(6, y, size - 12, 2);
  }
  return { map: toTexture(canvas, true), emissiveMap: toTexture(eCanvas, true) };
}

/**
 * Asphalt strip: 12 m wide x 24 m long. Double yellow centre line, white edge
 * lines, speckle grain. Repeat along the street length.
 */
export function makeAsphaltTexture(rng) {
  const [canvas, ctx] = makeCanvas(128, 256);
  ctx.fillStyle = '#33343a';
  ctx.fillRect(0, 0, 128, 256);
  speckle(ctx, 128, 256, rng, 1400, ['#3a3b41', '#2b2c31', '#414247', '#26272c']);
  // Patches and cracks.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(rng() * 110, rng() * 230, 8 + rng() * 20, 10 + rng() * 26);
  }
  // Double yellow centre line.
  ctx.fillStyle = '#e8b93a';
  ctx.fillRect(60, 0, 3, 256);
  ctx.fillRect(65, 0, 3, 256);
  // White edge lines.
  ctx.fillStyle = 'rgba(240,240,235,0.85)';
  ctx.fillRect(4, 0, 3, 256);
  ctx.fillRect(121, 0, 3, 256);
  // Dashed lane guides (faint, between centre and edge).
  ctx.fillStyle = 'rgba(240,240,235,0.35)';
  for (let y = 0; y < 256; y += 64) {
    ctx.fillRect(31, y + 8, 3, 30);
    ctx.fillRect(94, y + 8, 3, 30);
  }
  return toTexture(canvas, true);
}

/** Plain asphalt square for intersections (no markings — they stop at the kerb). */
export function makeAsphaltPlainTexture(rng) {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#33343a';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rng, 700, ['#3a3b41', '#2b2c31', '#414247']);
  return toTexture(canvas, false);
}

/** Zebra crossing: white bars across a 12 m wide strip. */
export function makeZebraTexture() {
  const [canvas, ctx] = makeCanvas(128, 64);
  ctx.fillStyle = '#33343a';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = 'rgba(245,245,240,0.92)';
  for (let x = 4; x < 128; x += 14) ctx.fillRect(x, 6, 8, 52);
  return toTexture(canvas, false);
}

/** Sidewalk: pale concrete slabs with expansion joints. */
export function makeSidewalkTexture(rng) {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#b5aea0';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rng, 500, ['#beb7a9', '#a9a293', '#c2bbad']);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  return toTexture(canvas, true);
}

/** Grass: green noise for the park and front lawns. */
export function makeGrassTexture(rng) {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#5d8a4a';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rng, 1600, ['#6b9a55', '#527a3f', '#7ba85e', '#4a7038'], 3);
  return toTexture(canvas, true);
}

/** Sand: warm grain for the beach strip. */
export function makeSandTexture(rng) {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#e3d3a4';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rng, 900, ['#ecdcae', '#d8c48d', '#f2e6bd', '#cdb87e']);
  return toTexture(canvas, true);
}

/**
 * A sign board: bold display text on a coloured background with a thin border.
 * Used for landmark names (hospital, police HQ, respray, gas station).
 */
export function makeSignTexture(text, opts = {}) {
  const bg = opts.bg || '#1f2937';
  const fg = opts.fg || '#ffffff';
  const sub = opts.sub || '';
  const [canvas, ctx] = makeCanvas(512, 128);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 52px "Arial Black", sans-serif';
  const label = text.toUpperCase();
  // Shrink to fit if the name is long.
  let size = 52;
  while (ctx.measureText(label).width > 470 && size > 24) {
    size -= 2;
    ctx.font = `bold ${size}px "Arial Black", sans-serif`;
  }
  ctx.fillText(label, 256, sub ? 52 : 64);
  if (sub) {
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText(sub.toUpperCase(), 256, 96);
  }
  return toTexture(canvas, false);
}

/** Simple circular blob shadow, drawn under vehicles and pedestrians. */
export function makeBlobShadowTexture() {
  const [canvas, ctx] = makeCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(canvas, false);
}
