// Code-drawn textures: every surface pattern is painted on a canvas at load,
// so the game ships zero image assets. All noise comes from the seeded stream,
// so the same seed paints the same walls.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')];
}

function texture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

function speckle(ctx, size, random, count, light, dark) {
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    ctx.fillStyle = random() < 0.5 ? light : dark;
    ctx.globalAlpha = 0.05 + random() * 0.12;
    ctx.fillRect(x, y, 1 + Math.floor(random() * 3), 1 + Math.floor(random() * 3));
  }
  ctx.globalAlpha = 1;
}

export function createTextures(random) {
  // Asphalt yard floor: dark slabs with seams and wear.
  const [floorC, floorCtx] = canvas(512);
  floorCtx.fillStyle = PALETTE.ground;
  floorCtx.fillRect(0, 0, 512, 512);
  speckle(floorCtx, 512, random, 2600, '#3a3b46', '#1d1e26');
  floorCtx.strokeStyle = 'rgba(0,0,0,0.35)';
  floorCtx.lineWidth = 3;
  for (let i = 0; i <= 4; i += 1) {
    floorCtx.beginPath(); floorCtx.moveTo(i * 128, 0); floorCtx.lineTo(i * 128, 512); floorCtx.stroke();
    floorCtx.beginPath(); floorCtx.moveTo(0, i * 128); floorCtx.lineTo(512, i * 128); floorCtx.stroke();
  }
  floorCtx.strokeStyle = 'rgba(255,255,255,0.05)';
  floorCtx.lineWidth = 1;
  for (let i = 0; i < 40; i += 1) {
    const y = random() * 512;
    floorCtx.beginPath(); floorCtx.moveTo(0, y); floorCtx.lineTo(512, y + (random() - 0.5) * 40); floorCtx.stroke();
  }

  // Concrete wall panels with rivets and a grime gradient at the base.
  const [wallC, wallCtx] = canvas(512);
  wallCtx.fillStyle = PALETTE.concrete;
  wallCtx.fillRect(0, 0, 512, 512);
  speckle(wallCtx, 512, random, 1800, '#4a4b56', '#2c2d36');
  wallCtx.fillStyle = 'rgba(0,0,0,0.18)';
  wallCtx.fillRect(0, 430, 512, 82);
  wallCtx.strokeStyle = 'rgba(0,0,0,0.4)';
  wallCtx.lineWidth = 4;
  wallCtx.strokeRect(4, 4, 504, 504);
  wallCtx.beginPath(); wallCtx.moveTo(256, 0); wallCtx.lineTo(256, 512); wallCtx.stroke();
  wallCtx.fillStyle = 'rgba(255,255,255,0.10)';
  for (const [x, y] of [[24, 24], [488, 24], [24, 488], [488, 488], [256, 24], [256, 488]]) {
    wallCtx.beginPath(); wallCtx.arc(x, y, 6, 0, Math.PI * 2); wallCtx.fill();
  }

  // Corrugated metal for containers and the warehouse.
  const [metalC, metalCtx] = canvas(256);
  metalCtx.fillStyle = PALETTE.metal;
  metalCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    metalCtx.fillStyle = 'rgba(255,255,255,0.07)';
    metalCtx.fillRect(x, 0, 4, 256);
    metalCtx.fillStyle = 'rgba(0,0,0,0.22)';
    metalCtx.fillRect(x + 10, 0, 4, 256);
  }
  speckle(metalCtx, 256, random, 500, '#5a5d68', '#33353f');
  metalCtx.fillStyle = 'rgba(0,0,0,0.25)';
  metalCtx.fillRect(0, 0, 256, 6);
  metalCtx.fillRect(0, 250, 256, 6);

  // Wooden crate with frame and stencil.
  const [crateC, crateCtx] = canvas(256);
  crateCtx.fillStyle = '#7a5c33';
  crateCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) {
    crateCtx.fillStyle = 'rgba(0,0,0,0.18)';
    crateCtx.fillRect(0, y, 256, 3);
    crateCtx.fillStyle = 'rgba(255,255,255,0.05)';
    crateCtx.fillRect(0, y + 3, 256, 2);
  }
  speckle(crateCtx, 256, random, 500, '#8a6a3d', '#5d4526');
  crateCtx.strokeStyle = '#4d3a1e';
  crateCtx.lineWidth = 14;
  crateCtx.strokeRect(7, 7, 242, 242);
  crateCtx.beginPath(); crateCtx.moveTo(0, 0); crateCtx.lineTo(256, 256); crateCtx.moveTo(256, 0); crateCtx.lineTo(0, 256);
  crateCtx.lineWidth = 8; crateCtx.stroke();
  crateCtx.fillStyle = 'rgba(238,241,246,0.75)';
  crateCtx.font = 'bold 34px system-ui, sans-serif';
  crateCtx.textAlign = 'center';
  crateCtx.fillText('NS-07', 128, 140);

  // Hazard stripes for site borders and the tower edge.
  const [hazardC, hazardCtx] = canvas(128);
  hazardCtx.fillStyle = '#d9a514';
  hazardCtx.fillRect(0, 0, 128, 128);
  hazardCtx.fillStyle = '#14141c';
  for (let i = -128; i < 256; i += 32) {
    hazardCtx.beginPath();
    hazardCtx.moveTo(i, 128); hazardCtx.lineTo(i + 16, 128); hazardCtx.lineTo(i + 16 + 128, 0); hazardCtx.lineTo(i + 128, 0);
    hazardCtx.closePath(); hazardCtx.fill();
  }

  // Site letter sign (A or B), painted on a dark plate with a neon rim.
  function siteSign(letter, color) {
    const [c, ctx] = canvas(256);
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 236, 236);
    ctx.shadowColor = color;
    ctx.shadowBlur = 28;
    ctx.fillStyle = color;
    ctx.font = 'bold 170px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 128, 136);
    return texture(c);
  }

  // Soft round glow sprite for muzzle flashes, tracers and the bomb light.
  const [glowC, glowCtx] = canvas(64);
  const gradient = glowCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  glowCtx.fillStyle = gradient;
  glowCtx.fillRect(0, 0, 64, 64);

  return {
    floor: texture(floorC, 12, 9),
    wall: texture(wallC, 6, 1),
    metal: texture(metalC, 3, 1),
    crate: texture(crateC),
    hazard: texture(hazardC, 4, 1),
    signA: siteSign('A', PALETTE.cyan),
    signB: siteSign('B', PALETTE.magenta),
    glow: texture(glowC),
  };
}
