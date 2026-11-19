// Procedural canvas textures for Solmar City. Every surface in the game is
// painted at runtime with the 2D canvas API — no external image files, no
// network requests. A seeded generator keeps the window lights, speckles and
// caustic cells identical on every load.

import * as THREE from 'three';
import { mulberry32 } from '../random.js';

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Building facade: concrete base, a grid of windows, a few lit warm.
function facadeTexture(rng) {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b8bcc2';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 256, 1);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 12 + col * 40;
      const y = 10 + row * 30;
      const lit = rng() < 0.25;
      ctx.fillStyle = lit ? '#ffd98a' : '#2c3e55';
      ctx.fillRect(x, y, 24, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, 24, 3);
    }
  }
  return toTexture(canvas, 2, 2);
}

// Asphalt with a dashed centre line and worn edges.
function roadTexture(rng) {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#33373d';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(Math.floor(rng() * 256), Math.floor(rng() * 256), 2, 2);
  }
  ctx.fillStyle = '#e8d44d';
  for (let y = 0; y < 256; y += 32) ctx.fillRect(126, y + 4, 4, 18);
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(4, 0, 3, 256);
  ctx.fillRect(249, 0, 3, 256);
  return toTexture(canvas, 1, 8);
}

// Pavement slabs with expansion joints.
function sidewalkTexture(rng) {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9a938a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * 64);
    ctx.lineTo(256, i * 64);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 300; i++) {
    ctx.fillRect(Math.floor(rng() * 256), Math.floor(rng() * 256), 2, 2);
  }
  return toTexture(canvas, 6, 6);
}

// Beach sand: warm base with speckles and faint ripple bands.
function sandTexture(rng) {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e3c98f';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const shade = rng() < 0.5 ? 'rgba(120,90,40,0.25)' : 'rgba(255,244,200,0.35)';
    ctx.fillStyle = shade;
    ctx.fillRect(Math.floor(rng() * 256), Math.floor(rng() * 256), 2, 2);
  }
  ctx.strokeStyle = 'rgba(150,115,60,0.18)';
  ctx.lineWidth = 3;
  for (let y = 8; y < 256; y += 22) {
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 16) {
      ctx.lineTo(x, y + Math.sin(x / 24 + y) * 3);
    }
    ctx.stroke();
  }
  return toTexture(canvas, 8, 8);
}

// Open water base: deep blue-green gradient with soft streaks.
function waterTexture(rng) {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1d6f8a');
  grad.addColorStop(1, '#0d3f5c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const y = rng() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + rng() * 8 - 4, 170, y + rng() * 8 - 4, 256, y);
    ctx.stroke();
  }
  return toTexture(canvas, 10, 10);
}

// Caustic light cells: bright web-like blobs on black, used additively.
function causticsTexture(rng) {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    const r = 8 + rng() * 22;
    const grad = ctx.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, 'rgba(190,240,255,0.55)');
    grad.addColorStop(0.6, 'rgba(120,200,235,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(200,245,255,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 60; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    ctx.beginPath();
    ctx.arc(x, y, 4 + rng() * 14, rng() * Math.PI, rng() * Math.PI + 2);
    ctx.stroke();
  }
  return toTexture(canvas, 6, 6);
}

// Soft radial blob shadow, used under the player, cars and pedestrians.
export function makeBlobShadowTexture() {
  const canvas = makeCanvas(128);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Palm frond: a single leafy frond drawn on transparency, crossed in pairs
// to read as a canopy from any angle.
function frondTexture() {
  const canvas = makeCanvas(128);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = '#2f7a34';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 126);
  ctx.quadraticCurveTo(70, 60, 64, 4);
  ctx.stroke();
  ctx.strokeStyle = '#3f9a44';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    const y = 120 - t * 108;
    const spread = 8 + t * 46;
    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.quadraticCurveTo(64 - spread, y + 8, 64 - spread - 6, y + 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.quadraticCurveTo(64 + spread, y + 8, 64 + spread + 6, y + 20);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// All procedural textures, built once at startup from one seeded stream.
export function makeTextures(seed = 1) {
  const rng = mulberry32(seed);
  return {
    facade: facadeTexture(rng),
    road: roadTexture(rng),
    sidewalk: sidewalkTexture(rng),
    sand: sandTexture(rng),
    water: waterTexture(rng),
    caustics: causticsTexture(rng),
    frond: frondTexture(),
    blobShadow: makeBlobShadowTexture(),
  };
}
