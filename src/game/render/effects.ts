/**
 * Effects system: particle bursts (food pickup, portal use, death) and
 * ambient screen particles (fireflies, embers, dust, snow, etc.).
 * All effects render additively for a bloom-like look.
 */

import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../constants';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  fadeAlpha: number;
  gravity?: number;
  rotation?: number;
  vr?: number;
}

const particles: Particle[] = [];

/** Screen shake state */
let shakeMag = 0;
let shakeDecay = 5;

export function triggerShake(magnitude = 6, decay = 5): void {
  shakeMag = Math.max(shakeMag, magnitude);
  shakeDecay = decay;
}

export function updateShake(dt: number): { x: number; y: number } {
  if (shakeMag <= 0) return { x: 0, y: 0 };
  const angle = Math.random() * Math.PI * 2;
  const offset = { x: Math.cos(angle) * shakeMag, y: Math.sin(angle) * shakeMag };
  shakeMag = Math.max(0, shakeMag - shakeDecay * dt * 60);
  return offset;
}

/** Called once per frame to move + expire particles */
export function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += p.gravity * dt;
    if (p.vr) p.rotation = (p.rotation || 0) + p.vr * dt;
    p.life -= dt;
    // Simple air drag
    p.vx *= 0.985;
    p.vy *= 0.985;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/** Renders all particles additively */
export function drawParticles(ctx: CanvasRenderingContext2D): void {
  if (particles.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const t = Math.max(0, p.life / p.maxLife);
    const a = t * p.fadeAlpha;
    ctx.fillStyle = p.color.replace('ALPHA', a.toFixed(3));
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Burst emitted when the dragon eats normal food */
export function emitEatBurst(x: number, y: number): void {
  for (let i = 0; i < 22; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 140;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
      size: 1.5 + Math.random() * 2.5,
      color: `rgba(255, ${180 + Math.floor(Math.random() * 60)}, 120, ALPHA)`,
      fadeAlpha: 1,
    });
  }
}

/** Larger, more spectacular burst for final food */
export function emitFinalBurst(x: number, y: number): void {
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 240;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.8 + Math.random() * 0.7,
      maxLife: 1.5,
      size: 2 + Math.random() * 3.5,
      color: `rgba(255, ${200 + Math.floor(Math.random() * 55)}, 100, ALPHA)`,
      fadeAlpha: 1,
    });
  }
  // Gold sparks
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 120;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: 1 + Math.random(),
      maxLife: 2,
      size: 1.5 + Math.random() * 2,
      color: `rgba(255, 250, 200, ALPHA)`,
      fadeAlpha: 1,
      gravity: 80,
    });
  }
}

/** Death burst */
export function emitDeathBurst(x: number, y: number): void {
  triggerShake(10, 4);
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 200;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.6 + Math.random() * 0.6,
      maxLife: 1.2,
      size: 2 + Math.random() * 3,
      color: `rgba(255, ${60 + Math.floor(Math.random() * 60)}, 40, ALPHA)`,
      fadeAlpha: 1,
    });
  }
}

/** Ring emitted when dragon uses a portal */
export function emitPortalRing(x: number, y: number, color: string): void {
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * 120,
      vy: Math.sin(angle) * 120,
      life: 0.5,
      maxLife: 0.5,
      size: 2.5,
      color: color.replace('rgb', 'rgba').replace(')', ', ALPHA)'),
      fadeAlpha: 0.9,
    });
  }
}

/* -----------------------------------------------------------------
 * Ambient screen particles — persistent, seeded per level. Each theme
 * uses different palettes and motion so the world feels alive.
 * ----------------------------------------------------------------- */

interface AmbientParticle {
  x: number;
  y: number;
  z: number; // depth 0..1 for parallax
  size: number;
  baseAlpha: number;
  phase: number;
  hue: string;
  driftX: number;
  driftY: number;
}

let ambient: AmbientParticle[] = [];
let ambientTheme = '';

function seedAmbient(theme: string): void {
  ambient = [];
  const configs: Record<string, () => AmbientParticle[]> = {
    green_meadow: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 24; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 1.5 + Math.random() * 2,
          baseAlpha: 0.35 + Math.random() * 0.3,
          phase: Math.random() * Math.PI * 2,
          hue: '210, 255, 140',
          driftX: -8 + Math.random() * 16,
          driftY: -4 + Math.random() * 8,
        });
      }
      return out;
    },
    desert_ruins: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 30; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 0.8 + Math.random() * 1.4,
          baseAlpha: 0.15 + Math.random() * 0.2,
          phase: Math.random() * Math.PI * 2,
          hue: '245, 220, 160',
          driftX: 30 + Math.random() * 40,
          driftY: -2 + Math.random() * 4,
        });
      }
      return out;
    },
    ocean_temple: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 22; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 2 + Math.random() * 3,
          baseAlpha: 0.35 + Math.random() * 0.35,
          phase: Math.random() * Math.PI * 2,
          hue: '160, 240, 240',
          driftX: -5 + Math.random() * 10,
          driftY: -25 - Math.random() * 15,
        });
      }
      return out;
    },
    lava_arena: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 38; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 1.5 + Math.random() * 2.5,
          baseAlpha: 0.5 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          hue: '255, 140, 50',
          driftX: -3 + Math.random() * 6,
          driftY: -30 - Math.random() * 30,
        });
      }
      return out;
    },
    dark_forest: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 18; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 2 + Math.random() * 2,
          baseAlpha: 0.5 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          hue: '200, 255, 130',
          driftX: -10 + Math.random() * 20,
          driftY: -6 + Math.random() * 12,
        });
      }
      return out;
    },
    frozen_cave: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 45; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 1 + Math.random() * 2,
          baseAlpha: 0.5 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          hue: '220, 240, 255',
          driftX: 5 + Math.random() * 15,
          driftY: 25 + Math.random() * 25,
        });
      }
      return out;
    },
    ancient_temple: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 20; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 1.2 + Math.random() * 1.8,
          baseAlpha: 0.25 + Math.random() * 0.35,
          phase: Math.random() * Math.PI * 2,
          hue: '250, 220, 140',
          driftX: -4 + Math.random() * 8,
          driftY: -6 + Math.random() * 12,
        });
      }
      return out;
    },
    space_station: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 60; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 0.8 + Math.random() * 1.6,
          baseAlpha: 0.5 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
          hue: '200, 220, 255',
          driftX: -2 + Math.random() * 4,
          driftY: -2 + Math.random() * 4,
        });
      }
      return out;
    },
    electric_lab: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 30; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 1.2 + Math.random() * 2,
          baseAlpha: 0.4 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          hue: '150, 255, 230',
          driftX: -6 + Math.random() * 12,
          driftY: -6 + Math.random() * 12,
        });
      }
      return out;
    },
    dragons_lair: () => {
      const out: AmbientParticle[] = [];
      for (let i = 0; i < 32; i++) {
        out.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          z: Math.random(),
          size: 1.5 + Math.random() * 2.5,
          baseAlpha: 0.4 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          hue: '255, 100, 130',
          driftX: -4 + Math.random() * 8,
          driftY: -20 - Math.random() * 20,
        });
      }
      return out;
    },
  };
  ambient = (configs[theme] ?? configs.green_meadow)();
}

export function updateAmbient(theme: string, dt: number): void {
  if (theme !== ambientTheme) {
    seedAmbient(theme);
    ambientTheme = theme;
  }
  for (const p of ambient) {
    p.x += p.driftX * dt * (0.4 + p.z);
    p.y += p.driftY * dt * (0.4 + p.z);
    // wrap
    if (p.x < -20) p.x = SCREEN_WIDTH + 20;
    if (p.x > SCREEN_WIDTH + 20) p.x = -20;
    if (p.y < -20) p.y = SCREEN_HEIGHT + 20;
    if (p.y > SCREEN_HEIGHT + 20) p.y = -20;
    p.phase += dt * 2;
  }
}

export function drawAmbient(ctx: CanvasRenderingContext2D): void {
  if (ambient.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of ambient) {
    const tw = 0.6 + Math.sin(p.phase) * 0.4;
    const a = p.baseAlpha * tw;
    ctx.fillStyle = `rgba(${p.hue}, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
