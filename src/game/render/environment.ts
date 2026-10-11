/**
 * Peak-graphics environment renderer.
 *
 * Each theme paints a multi-layered background:
 *   1. Deep vignette gradient base
 *   2. Large-scale "terrain" noise (pre-baked once per theme, tinted)
 *   3. Theme-specific hero decor (dunes, caustics, cracks, runes, stars…)
 *   4. Ambient particles (drawn by effects.ts on top)
 *
 * Walls use per-theme materials with beveled top edges, ambient occlusion
 * shadows dropped on the ground, and painted top faces.
 */

import { CELL_SIZE, GRID_HEIGHT, GRID_WIDTH, SCREEN_HEIGHT, SCREEN_WIDTH } from '../constants';
import type { LevelData, ThemeColors } from '../types';
import { keyOf } from '../systems/helpers';

/* ------------------------------------------------------------------ */
/* Utility color                                                       */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (n: number) => Math.max(0, Math.min(255, n + amt));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/** Shifts a hex color by `amt` and returns hex (safe to re-parse) */
function liftHex(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n + amt)));
  const h = (n: number) => c(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Builds a bright, airy daylight variant of a theme palette for Light Mode.
 * Backgrounds lift a lot, walls lift moderately so they stay readable
 * against the lighter ground.
 */
export function toLightPalette(c: ThemeColors): ThemeColors {
  return {
    ...c,
    bg1: liftHex(c.bg1, 82),
    bg2: liftHex(c.bg2, 76),
    bg3: liftHex(c.bg3, 68),
    wall: liftHex(c.wall, 44),
    wallEdge: liftHex(c.wallEdge, 32),
    wallHighlight: liftHex(c.wallHighlight, 46),
    decor: liftHex(c.decor, 36),
  };
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ------------------------------------------------------------------ */
/* Cached procedural background textures (baked once per theme)         */
/* ------------------------------------------------------------------ */

const textureCache = new Map<string, HTMLCanvasElement>();

function makeNoiseTexture(
  theme: string,
  colors: ThemeColors,
  isLight: boolean
): HTMLCanvasElement {
  const cacheKey = `${theme}_${isLight ? 'light' : 'dark'}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const w = SCREEN_WIDTH;
  const h = SCREEN_HEIGHT;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  // Base gradient
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, colors.bg1);
  bg.addColorStop(0.5, colors.bg2);
  bg.addColorStop(1, colors.bg3);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Value-noise blobs (large + medium + small octaves)
  const blobs = [
    { count: 18, size: 220, alpha: 0.18, color: colors.bg3 },
    { count: 30, size: 120, alpha: 0.14, color: colors.bg1 },
    { count: 60, size: 60, alpha: 0.09, color: colors.decor },
  ];
  for (const octave of blobs) {
    for (let i = 0; i < octave.count; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, octave.size);
      g.addColorStop(0, rgba(octave.color, octave.alpha));
      g.addColorStop(1, rgba(octave.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, octave.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Theme-specific baked terrain
  bakeThemeTerrain(ctx, theme, colors, w, h);

  // Fine grain
  const grain = ctx.getImageData(0, 0, w, h);
  const d = grain.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(grain, 0, 0);

  textureCache.set(cacheKey, c);
  return c;
}

function bakeThemeTerrain(
  ctx: CanvasRenderingContext2D,
  theme: string,
  c: ThemeColors,
  w: number,
  h: number
): void {
  switch (theme) {
    case 'green_meadow': {
      // Painted grass tufts
      for (let i = 0; i < 220; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = 6 + Math.random() * 10;
        ctx.fillStyle = rgba(shade(c.decor, (i % 5) * 6 - 12), 0.35);
        ctx.beginPath();
        ctx.ellipse(x, y, size, size * 0.5, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // A few flower petals
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(232,160,192,0.55)' : 'rgba(240,220,110,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, 2.5 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'desert_ruins': {
      // Layered dune bands
      for (let i = 0; i < 10; i++) {
        const yBase = 40 + i * 70;
        ctx.fillStyle = rgba(shade(c.bg3, 12 - i * 3), 0.5);
        ctx.beginPath();
        ctx.moveTo(0, yBase);
        for (let x = 0; x <= w; x += 20) {
          ctx.lineTo(x, yBase + Math.sin(x * 0.008 + i) * 24);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
      }
      // Sand-stone cracks
      ctx.strokeStyle = rgba(c.bg1, 0.5);
      ctx.lineWidth = 1;
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.random() * 40 - 20, y + Math.random() * 40 - 20);
        ctx.lineTo(x + Math.random() * 80 - 40, y + Math.random() * 80 - 40);
        ctx.stroke();
      }
      break;
    }
    case 'ocean_temple': {
      // Wavy caustics
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.strokeStyle = rgba(c.particle, 0.18);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let t = 0; t < Math.PI * 2; t += 0.4) {
          const r = 35 + Math.sin(t * 3 + i) * 12;
          const px = x + Math.cos(t) * r;
          const py = y + Math.sin(t) * r * 0.4;
          if (t === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // Coral clumps
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.fillStyle = rgba('#ff6b9d', 0.15);
        ctx.beginPath();
        ctx.arc(x, y, 8 + Math.random() * 12, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'lava_arena': {
      // Cracked obsidian floor with lava veins
      ctx.strokeStyle = rgba('#ff5500', 0.5);
      ctx.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        let cx = x;
        let cy = y;
        for (let s = 0; s < 6; s++) {
          cx += (Math.random() - 0.5) * 40;
          cy += (Math.random() - 0.5) * 40;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
        // Glow around veins
        const g = ctx.createRadialGradient(x, y, 0, x, y, 60);
        g.addColorStop(0, 'rgba(255,120,0,0.25)');
        g.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 60, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'dark_forest': {
      // Distant tree silhouettes
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const th = 45 + Math.random() * 45;
        ctx.fillStyle = rgba(shade(c.bg1, -18), 0.55);
        ctx.beginPath();
        ctx.moveTo(x, y + th);
        ctx.lineTo(x - 14, y + th * 0.35);
        ctx.lineTo(x - 5, y + th * 0.4);
        ctx.lineTo(x - 10, y + th * 0.1);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 10, y + th * 0.1);
        ctx.lineTo(x + 5, y + th * 0.4);
        ctx.lineTo(x + 14, y + th * 0.35);
        ctx.closePath();
        ctx.fill();
      }
      // Moss patches
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.fillStyle = rgba(c.decor, 0.28);
        ctx.beginPath();
        ctx.arc(x, y, 8 + Math.random() * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'frozen_cave': {
      // Ice sheen ovals
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const g = ctx.createRadialGradient(x, y, 2, x, y, 55);
        g.addColorStop(0, rgba(c.particle, 0.28));
        g.addColorStop(1, rgba(c.particle, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, 55, 30, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // Frost cracks
      ctx.strokeStyle = rgba('#c0e8ff', 0.35);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
        }
        ctx.stroke();
      }
      break;
    }
    case 'ancient_temple': {
      // Tile floor pattern (subtle diamonds, no visible grid)
      ctx.save();
      ctx.globalAlpha = 0.08;
      const tile = 60;
      for (let y = 0; y < h; y += tile) {
        for (let x = 0; x < w; x += tile) {
          ctx.strokeStyle = c.accent;
          ctx.beginPath();
          ctx.moveTo(x + tile / 2, y + 6);
          ctx.lineTo(x + tile - 6, y + tile / 2);
          ctx.lineTo(x + tile / 2, y + tile - 6);
          ctx.lineTo(x + 6, y + tile / 2);
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();
      // Runes
      ctx.font = '18px serif';
      ctx.fillStyle = rgba(c.accent, 0.28);
      for (let i = 0; i < 24; i++) {
        const glyph = ['◆', '❖', '✦', '✧', '◈'][i % 5];
        ctx.fillText(glyph, Math.random() * w, Math.random() * h);
      }
      break;
    }
    case 'space_station': {
      // Dense starfield (baked so stars don't jitter)
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = i % 40 === 0 ? 2 : 0.8 + Math.random() * 0.9;
        ctx.fillStyle = `rgba(220,235,255,${0.4 + Math.random() * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Nebula clouds
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 160);
        const hue = i % 2 === 0 ? '110, 60, 200' : '60, 100, 220';
        g.addColorStop(0, `rgba(${hue}, 0.22)`);
        g.addColorStop(1, `rgba(${hue}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 160, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'electric_lab': {
      // Circuit trace grid
      ctx.strokeStyle = rgba(c.accent, 0.2);
      ctx.lineWidth = 1;
      for (let i = 0; i < 22; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        let cx = x;
        let cy = y;
        for (let s = 0; s < 5; s++) {
          const horiz = Math.random() > 0.5;
          const len = 30 + Math.random() * 60;
          if (horiz) cx += len * (Math.random() > 0.5 ? 1 : -1);
          else cy += len * (Math.random() > 0.5 ? 1 : -1);
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
        // Solder pads
        ctx.fillStyle = rgba(c.accent, 0.35);
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'dragons_lair': {
      // Ritual glow spots
      for (let i = 0; i < 22; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 100);
        g.addColorStop(0, 'rgba(255,50,80,0.16)');
        g.addColorStop(1, 'rgba(255,50,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 100, 0, Math.PI * 2);
        ctx.fill();
      }
      // Bone shards
      ctx.strokeStyle = rgba('#d0c4a0', 0.35);
      ctx.lineWidth = 2;
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.random() * Math.PI);
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-8, 0, 1.6, 0, Math.PI * 2);
        ctx.arc(8, 0, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public: background                                                  */
/* ------------------------------------------------------------------ */

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  colors: ThemeColors,
  theme: string,
  time: number,
  isLight = false
): void {
  const tex = makeNoiseTexture(theme, colors, isLight);
  ctx.drawImage(tex, 0, 0);

  // Animated overlays per theme (drawn on top of the baked texture)
  ctx.save();
  if (isLight) ctx.globalAlpha = 0.5; // atmospherics are subtler in daylight
  drawAnimatedOverlay(ctx, theme, colors, time);
  ctx.restore();

  // Global vignette — deep and moody in dark mode, soft in light mode
  const vig = ctx.createRadialGradient(
    SCREEN_WIDTH / 2,
    SCREEN_HEIGHT / 2,
    SCREEN_HEIGHT * 0.35,
    SCREEN_WIDTH / 2,
    SCREEN_HEIGHT / 2,
    SCREEN_WIDTH * 0.75
  );
  if (isLight) {
    vig.addColorStop(0, 'rgba(255,255,255,0.03)');
    vig.addColorStop(1, 'rgba(35,45,55,0.28)');
  } else {
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  }
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
}

function drawAnimatedOverlay(
  ctx: CanvasRenderingContext2D,
  theme: string,
  c: ThemeColors,
  time: number
): void {
  switch (theme) {
    case 'lava_arena': {
      // Pulsing lava-crack glow spots
      for (let i = 0; i < 10; i++) {
        const x = (i * 137) % SCREEN_WIDTH;
        const y = (i * 89) % SCREEN_HEIGHT;
        const pulse = 0.2 + Math.sin(time * 2 + i) * 0.15;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 90);
        g.addColorStop(0, `rgba(255,120,20,${pulse})`);
        g.addColorStop(1, 'rgba(255,120,20,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 90, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'ocean_temple': {
      // Moving caustic slices
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const x = ((time * 25 + i * 200) % (SCREEN_WIDTH + 200)) - 100;
        const y = ((Math.sin(time * 0.3 + i) * 0.5 + 0.5) * SCREEN_HEIGHT);
        ctx.fillStyle = rgba(c.particle, 0.09);
        ctx.beginPath();
        ctx.ellipse(x, y, 90, 20, time * 0.5 + i, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'electric_lab': {
      // Flickering panels
      if (Math.sin(time * 8) > 0.7) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const x = (i * 240 + (time * 30) % 200);
          const y = (i * 170) % SCREEN_HEIGHT;
          ctx.strokeStyle = rgba(c.particle, 0.7);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 20, y - 12);
          ctx.lineTo(x + 32, y + 6);
          ctx.lineTo(x + 55, y - 8);
          ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }
    case 'dragons_lair': {
      // Slow breathing dark red halo
      const pulse = 0.18 + Math.sin(time * 1.2) * 0.08;
      const g = ctx.createRadialGradient(
        SCREEN_WIDTH / 2,
        SCREEN_HEIGHT / 2,
        SCREEN_HEIGHT * 0.2,
        SCREEN_WIDTH / 2,
        SCREEN_HEIGHT / 2,
        SCREEN_WIDTH * 0.6
      );
      g.addColorStop(0, `rgba(180, 20, 50, ${pulse * 0.4})`);
      g.addColorStop(1, 'rgba(180, 20, 50, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Walls with ambient occlusion + theme material                       */
/* ------------------------------------------------------------------ */

export function drawWalls(
  ctx: CanvasRenderingContext2D,
  walls: Set<string>,
  colors: ThemeColors,
  theme: string
): void {
  // Pass 1: soft ambient occlusion shadow on ground under exposed edges
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#000';
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (!walls.has(keyOf([x, y]))) continue;
      const nD = walls.has(keyOf([x, y + 1]));
      const nR = walls.has(keyOf([x + 1, y]));
      // Only shadow down/right so we simulate a top-left light
      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;
      if (!nD) {
        const g = ctx.createLinearGradient(0, py + CELL_SIZE, 0, py + CELL_SIZE + 10);
        g.addColorStop(0, 'rgba(0,0,0,0.45)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px, py + CELL_SIZE, CELL_SIZE, 10);
      }
      if (!nR) {
        const g = ctx.createLinearGradient(px + CELL_SIZE, 0, px + CELL_SIZE + 10, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.45)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px + CELL_SIZE, py, 10, CELL_SIZE);
      }
    }
  }
  ctx.restore();

  // Pass 2: painted wall top faces
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (!walls.has(keyOf([x, y]))) continue;
      drawWallBlock(ctx, x, y, colors, theme, walls);
    }
  }
}

function drawWallBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colors: ThemeColors,
  theme: string,
  walls: Set<string>
): void {
  const px = x * CELL_SIZE;
  const py = y * CELL_SIZE;
  const s = CELL_SIZE;

  const nU = walls.has(keyOf([x, y - 1]));
  const nD = walls.has(keyOf([x, y + 1]));
  const nL = walls.has(keyOf([x - 1, y]));
  const nR = walls.has(keyOf([x + 1, y]));

  // Diagonal gradient base
  const g = ctx.createLinearGradient(px, py, px + s, py + s);
  g.addColorStop(0, colors.wallHighlight);
  g.addColorStop(0.5, colors.wall);
  g.addColorStop(1, colors.wallEdge);
  ctx.fillStyle = g;
  ctx.fillRect(px, py, s, s);

  // Theme-specific material overlay (painted top face)
  drawWallMaterial(ctx, px, py, s, theme, colors);

  // Bevel highlights (top/left)
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  if (!nU) ctx.fillRect(px + 1, py + 1, s - 2, 3);
  if (!nL) ctx.fillRect(px + 1, py + 1, 3, s - 2);

  // Bevel shadows (bottom/right) with gradient
  if (!nD) {
    const gg = ctx.createLinearGradient(0, py + s - 5, 0, py + s);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = gg;
    ctx.fillRect(px + 1, py + s - 6, s - 2, 6);
  }
  if (!nR) {
    const gg = ctx.createLinearGradient(px + s - 5, 0, px + s, 0);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = gg;
    ctx.fillRect(px + s - 6, py + 1, 6, s - 2);
  }

  // Exposed edge stroke
  ctx.strokeStyle = colors.wallEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (!nU) {
    ctx.moveTo(px, py);
    ctx.lineTo(px + s, py);
  }
  if (!nD) {
    ctx.moveTo(px, py + s);
    ctx.lineTo(px + s, py + s);
  }
  if (!nL) {
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + s);
  }
  if (!nR) {
    ctx.moveTo(px + s, py);
    ctx.lineTo(px + s, py + s);
  }
  ctx.stroke();
}

function drawWallMaterial(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  theme: string,
  colors: ThemeColors
): void {
  switch (theme) {
    case 'green_meadow': {
      // Moss speckles
      ctx.fillStyle = rgba(colors.decor, 0.4);
      for (let i = 0; i < 4; i++) {
        const rx = px + 4 + ((i * 11) % (s - 8));
        const ry = py + 4 + ((i * 7 + 3) % (s - 8));
        ctx.beginPath();
        ctx.arc(rx, ry, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Stone crack
      ctx.strokeStyle = rgba(colors.wallEdge, 0.6);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px + 4, py + s * 0.5);
      ctx.lineTo(px + s * 0.5, py + s * 0.3);
      ctx.lineTo(px + s - 6, py + s * 0.6);
      ctx.stroke();
      break;
    }
    case 'desert_ruins': {
      // Sandstone striations
      ctx.strokeStyle = rgba(colors.wallEdge, 0.4);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px + 3, py + s * 0.3 + i * 6);
        ctx.lineTo(px + s - 3, py + s * 0.3 + i * 6 + 2);
        ctx.stroke();
      }
      // Cuneiform mark
      ctx.fillStyle = rgba(colors.wallEdge, 0.5);
      ctx.fillRect(px + s * 0.4, py + s * 0.2, 3, 6);
      break;
    }
    case 'ocean_temple': {
      // Barnacle dots
      ctx.fillStyle = rgba(colors.accent, 0.5);
      for (let i = 0; i < 3; i++) {
        const rx = px + 6 + (i * 12) % (s - 12);
        const ry = py + 8 + ((i * 9 + 5) % (s - 16));
        ctx.beginPath();
        ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Kelp streak
      ctx.strokeStyle = rgba(colors.decor, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px + s * 0.5, py + 4);
      ctx.quadraticCurveTo(px + s * 0.35, py + s * 0.5, px + s * 0.55, py + s - 4);
      ctx.stroke();
      break;
    }
    case 'lava_arena': {
      // Glowing cracks
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,120,20,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px + 5, py + 6);
      ctx.lineTo(px + s * 0.4, py + s * 0.5);
      ctx.lineTo(px + s - 6, py + s - 8);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'dark_forest': {
      // Mossy bark
      ctx.fillStyle = rgba(colors.decor, 0.35);
      for (let i = 0; i < 6; i++) {
        const rx = px + 3 + ((i * 7) % (s - 6));
        const ry = py + 3 + ((i * 11) % (s - 6));
        ctx.beginPath();
        ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'frozen_cave': {
      // Ice crystal
      ctx.fillStyle = rgba('#cfe8ff', 0.5);
      ctx.beginPath();
      ctx.moveTo(px + s * 0.5, py + 4);
      ctx.lineTo(px + s - 6, py + s * 0.5);
      ctx.lineTo(px + s * 0.5, py + s - 4);
      ctx.lineTo(px + 6, py + s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      break;
    }
    case 'ancient_temple': {
      // Chiseled rune
      ctx.fillStyle = rgba(colors.accent, 0.55);
      ctx.font = 'bold 14px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◈', px + s / 2, py + s / 2);
      break;
    }
    case 'space_station': {
      // Panel with rivets
      ctx.strokeStyle = rgba(colors.accent, 0.6);
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 5, py + 5, s - 10, s - 10);
      ctx.fillStyle = rgba(colors.accent, 0.7);
      const rr = 1.8;
      [[8, 8], [s - 8, 8], [8, s - 8], [s - 8, s - 8]].forEach(([rx, ry]) => {
        ctx.beginPath();
        ctx.arc(px + rx, py + ry, rr, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case 'electric_lab': {
      // Glowing indicator + circuit box
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(colors.accent, 0.55);
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 6, py + 6, s - 12, s - 12);
      ctx.fillStyle = rgba(colors.accent, 0.7);
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'dragons_lair': {
      // Bloody sigil
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(px + s / 2, py + s / 2, 0, px + s / 2, py + s / 2, s * 0.5);
      g.addColorStop(0, 'rgba(255,50,90,0.35)');
      g.addColorStop(1, 'rgba(255,50,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Portals — animated glowing gates                                    */
/* ------------------------------------------------------------------ */

export function drawOpenings(
  ctx: CanvasRenderingContext2D,
  level: LevelData,
  time: number
): void {
  const colors = level.environment.colors;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [ox, oy] of level.openings) {
    const px = ox * CELL_SIZE;
    const py = oy * CELL_SIZE;
    const cx = px + CELL_SIZE / 2;
    const cy = py + CELL_SIZE / 2;
    const pulse = 0.45 + Math.sin(time * 3 + ox + oy) * 0.25;

    // Outer bloom
    const g1 = ctx.createRadialGradient(cx, cy, 2, cx, cy, CELL_SIZE * 0.9);
    g1.addColorStop(0, `rgba(120, 210, 255, ${pulse})`);
    g1.addColorStop(1, 'rgba(120,210,255,0)');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL_SIZE * 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Inner swirl (2 counter-rotating arcs)
    ctx.strokeStyle = rgba(colors.accent, 0.7);
    ctx.lineWidth = 2;
    const r = CELL_SIZE * 0.32;
    for (let i = 0; i < 2; i++) {
      const rot = time * (i === 0 ? 3 : -2.4) + i * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, r + i * 2, rot, rot + Math.PI * 0.9);
      ctx.stroke();
    }

    // Center bright dot
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* HUD — glass panel with animated progress and score                  */
/* ------------------------------------------------------------------ */

interface HudInfo {
  score: number;
  length: number;
  foods: number;
  limit: number;
  levelName: string;
  mode: string;
  speed: string;
  highScore: number;
  showProgress: boolean;
  isLight?: boolean;
  isBossFight?: boolean;
  bossVulnerable?: boolean;
  /** 0..1 remaining on the Constant-mode bonus fruit, or -1 when inactive */
  bonusProgress?: number;
}

export function drawHUDPanel(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const light = info.isLight === true;
  // Compact scoreboard keeps more of the arena visible.
  const barH = 40;

  // Palette flips with the UI mode
  const C = light
    ? {
        panelTop: 'rgba(255,255,255,0.88)',
        panelBottom: 'rgba(255,255,255,0.62)',
        sheen: 'rgba(0,0,0,0.06)',
        star: '#b8860b',
        score: '#1c2b1c',
        best: 'rgba(90,110,60,0.85)',
        foods: '#26602e',
        foodsSub: 'rgba(38,96,46,0.7)',
        level: '#3a3320',
        speed: '#1d4f73',
        track: 'rgba(0,0,0,0.18)',
      }
    : {
        panelTop: 'rgba(0,0,0,0.75)',
        panelBottom: 'rgba(0,0,0,0.25)',
        sheen: 'rgba(255,255,255,0.05)',
        star: '#ffd76a',
        score: '#f5efd8',
        best: 'rgba(255,215,110,0.5)',
        foods: '#b8e0a8',
        foodsSub: 'rgba(184,224,168,0.6)',
        level: '#e8dab0',
        speed: '#89b4d4',
        track: 'rgba(0,0,0,0.55)',
      };

  // Glass panel
  const g = ctx.createLinearGradient(0, 0, 0, barH);
  g.addColorStop(0, C.panelTop);
  g.addColorStop(1, C.panelBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN_WIDTH, barH);

  // Subtle inner sheen
  ctx.fillStyle = C.sheen;
  ctx.fillRect(0, 0, SCREEN_WIDTH, 1);

  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const midY = barH / 2;

  // Score with icon
  ctx.textAlign = 'left';
  ctx.fillStyle = C.star;
  ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('★', 14, midY);
  ctx.fillStyle = C.score;
  ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(String(info.score), 30, midY);

  if (info.highScore > 0) {
    ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = C.best;
    ctx.fillText(`Best: ${info.highScore}`, 30, midY + 14);
  }

  // Foods / length middle
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
  if (info.isBossFight) {
    ctx.fillStyle = C.foods;
    ctx.fillText(info.bossVulnerable ? 'Eat Warrior!' : `Boss Foods ${info.foods}/${info.limit}`, 140, midY);
    ctx.fillStyle = C.foodsSub;
    ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(info.bossVulnerable ? 'he is escaping' : 'he hunts your head', 140, midY + 14);
  } else if (info.showProgress) {
    ctx.fillStyle = C.foods;
    ctx.fillText(`⚡ ${info.foods} / ${info.limit}`, 140, midY);
    ctx.fillStyle = C.foodsSub;
    ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`len ${info.length}`, 140, midY + 14);
  } else {
    ctx.fillStyle = C.foods;
    ctx.fillText(`Length: ${info.length}`, 140, midY);
  }

  // Level name center
  ctx.textAlign = 'center';
  ctx.fillStyle = C.level;
  ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(info.levelName, SCREEN_WIDTH / 2, midY);

  // Speed right
  ctx.textAlign = 'right';
  ctx.fillStyle = C.speed;
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`⚡ ${info.speed}`, SCREEN_WIDTH - 14, midY);

  // ── Bonus fruit countdown readout (Constant mode) ──
  const bp = info.bonusProgress ?? -1;
  if (bp >= 0) {
    const bx = SCREEN_WIDTH - 150;
    const hue = bp > 0.5 ? 130 : bp > 0.25 ? 45 : 5;
    const flash = bp < 0.3 && Math.sin(Date.now() / 90) > 0 ? 1 : 0.75;

    ctx.textAlign = 'right';
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = `hsla(${hue}, 90%, ${light ? 32 : 62}%, ${flash})`;
    ctx.fillText('★ BONUS +5', bx, midY - 6);

    // Mini drain bar
    const mw = 90;
    ctx.fillStyle = C.track;
    ctx.beginPath();
    ctx.roundRect(bx - mw, midY + 4, mw, 4, 2);
    ctx.fill();
    ctx.fillStyle = `hsla(${hue}, 95%, 55%, ${flash})`;
    ctx.beginPath();
    ctx.roundRect(bx - mw, midY + 4, Math.max(2, mw * bp), 4, 2);
    ctx.fill();
  }

  // Progress bar
  if (info.showProgress && info.limit > 0) {
    const pct = Math.min(1, info.foods / info.limit);
    const bw = 240;
    const bx = SCREEN_WIDTH / 2 - bw / 2;
    const by = barH - 6;

    // Track
    ctx.fillStyle = C.track;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 4, 2);
    ctx.fill();

    // Fill with animated gradient
    if (pct > 0) {
      const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      if (pct >= 1) {
        pg.addColorStop(0, '#ffb800');
        pg.addColorStop(1, '#ffe66d');
      } else {
        pg.addColorStop(0, '#2d8f4e');
        pg.addColorStop(1, '#7ee060');
      }
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.roundRect(bx, by, Math.max(4, bw * pct), 4, 2);
      ctx.fill();

      // Glow tip
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tip = bx + bw * pct;
      const glow = ctx.createRadialGradient(tip, by + 2, 0, tip, by + 2, 12);
      glow.addColorStop(0, pct >= 1 ? 'rgba(255,220,120,0.9)' : 'rgba(160,255,120,0.7)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(tip - 12, by - 6, 24, 16);
      ctx.restore();
    }

    if (pct >= 1) {
      // "FINAL FOOD ACTIVE" pulsing text
      const alpha = 0.6 + Math.sin(Date.now() / 130) * 0.4;
      ctx.textAlign = 'center';
      ctx.fillStyle = light
        ? `rgba(150,95,0,${alpha})`
        : `rgba(255,220,110,${alpha})`;
      ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('★  FINAL FOOD ACTIVE  ★', SCREEN_WIDTH / 2, barH + 12);
    }
  }
}
