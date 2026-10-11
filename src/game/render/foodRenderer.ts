/**
 * Painted food sprite renderer with animated halo, orbiting sparkles,
 * and additive glow bloom. Uses the same chroma-key pipeline as the
 * dragon so JPEG-generated art renders on any environment.
 */

import { CELL_SIZE } from '../constants';
import type { ThemeColors } from '../types';
import { chromaKeyToCanvas, loadImage } from './spriteLoader';

import foodNormalUrl from '../../assets/food/food_normal.png';
import foodFinalUrl from '../../assets/food/food_final.png';

interface FoodSprites {
  normal: HTMLCanvasElement;
  final: HTMLCanvasElement;
}

let sprites: FoodSprites | null = null;
let loading: Promise<void> | null = null;

export function loadFoodSprites(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const [normalImg, finalImg] = await Promise.all([
      loadImage(foodNormalUrl),
      loadImage(foodFinalUrl),
    ]);
    sprites = {
      normal: chromaKeyToCanvas(normalImg, { hard: 45, soft: 90 }),
      final: chromaKeyToCanvas(finalImg, { hard: 45, soft: 90 }),
    };
  })();
  return loading;
}

/** Kick off loading immediately when this module is imported */
void loadFoodSprites();

/**
 * Draws a food gem at grid (x,y). `time` is seconds.
 *
 * `timerProgress` (0..1) — when >= 0, draws a depleting countdown ring
 * around the fruit (used by the Constant-mode timed bonus fruit).
 */
export function drawFoodSprite(
  ctx: CanvasRenderingContext2D,
  gridX: number,
  gridY: number,
  isFinal: boolean,
  colors: ThemeColors,
  time: number,
  timerProgress = -1
): void {
  const cx = gridX * CELL_SIZE + CELL_SIZE / 2;
  const cy = gridY * CELL_SIZE + CELL_SIZE / 2;
  const urgent = timerProgress >= 0 && timerProgress < 0.3;
  // Timed fruit bobs faster and pulses hard when about to expire
  const bob = Math.sin(time * (urgent ? 9 : 3.5)) * (urgent ? 3 : 2);

  // Larger, more dramatic bloom for final food
  const bloomR = isFinal ? CELL_SIZE * 1.6 : CELL_SIZE * 1.0;
  const bloomA = isFinal ? 0.55 : 0.38;

  // Outer soft halo
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(cx, cy + bob, 2, cx, cy + bob, bloomR);
  const glow = isFinal ? '255,220,120' : '255,120,120';
  halo.addColorStop(0, `rgba(${glow}, ${bloomA})`);
  halo.addColorStop(0.5, `rgba(${glow}, ${bloomA * 0.35})`);
  halo.addColorStop(1, `rgba(${glow}, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy + bob, bloomR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Pulse ring (final food only)
  if (isFinal) {
    const pulseA = 0.4 + Math.sin(time * 4) * 0.3;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 220, 120, ${pulseA})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const pulseR = CELL_SIZE * 0.55 + Math.sin(time * 4) * 3;
    ctx.arc(cx, cy + bob, pulseR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Painted sprite
  const s = sprites;
  if (s) {
    const img = isFinal ? s.final : s.normal;
    const size = isFinal ? CELL_SIZE * 1.05 : CELL_SIZE * 0.8;
    ctx.drawImage(img, cx - size / 2, cy - size / 2 + bob, size, size);
  } else {
    // Fallback while sprites load
    ctx.fillStyle = isFinal ? colors.foodGlow : colors.food;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, isFinal ? CELL_SIZE * 0.4 : CELL_SIZE * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // Orbiting sparkles
  const sparkleCount = isFinal ? 5 : 3;
  const orbitR = isFinal ? CELL_SIZE * 0.7 : CELL_SIZE * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < sparkleCount; i++) {
    const a = time * (isFinal ? 1.5 : 2) + (i * Math.PI * 2) / sparkleCount;
    const sx = cx + Math.cos(a) * orbitR;
    const sy = cy + bob + Math.sin(a) * orbitR * 0.5;
    const twinkle = 0.5 + Math.sin(time * 6 + i * 2) * 0.5;
    ctx.fillStyle = `rgba(255, 245, 200, ${twinkle * (isFinal ? 0.9 : 0.6)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, isFinal ? 2 + twinkle : 1.4 + twinkle * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // Cross flare
    if (twinkle > 0.7) {
      ctx.strokeStyle = `rgba(255, 245, 200, ${(twinkle - 0.7) * 2})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy);
      ctx.lineTo(sx + 4, sy);
      ctx.moveTo(sx, sy - 4);
      ctx.lineTo(sx, sy + 4);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ── Countdown ring for the timed bonus fruit ──
  if (timerProgress >= 0) {
    const ringR = CELL_SIZE * 0.62;
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * timerProgress;

    ctx.save();
    // Dark track
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Remaining-time arc — green → amber → red as it drains
    const hue = timerProgress > 0.5 ? 130 : timerProgress > 0.25 ? 45 : 5;
    const flash =
      urgent && Math.sin(time * 14) > 0 ? 1 : urgent ? 0.55 : 1;
    ctx.strokeStyle = `hsla(${hue}, 95%, 60%, ${flash})`;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + bob, ringR, start, end);
    ctx.stroke();

    // Additive glow on the arc
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${0.4 * flash})`;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, ringR, start, end);
    ctx.stroke();
    ctx.restore();

    // "5" value badge so the reward is unmistakable
    ctx.save();
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const badgeY = cy + bob - ringR - 9;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(cx - 15, badgeY - 8, 30, 16, 8);
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue}, 95%, 60%, 0.9)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#ffe066';
    ctx.fillText('+5', cx, badgeY);
    ctx.restore();
  }
}
