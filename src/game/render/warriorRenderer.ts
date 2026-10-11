import { CELL_SIZE, type Vec2 } from '../constants';
import warriorUrl from '../../assets/warrior/arena_warrior.png';
import { chromaKeyToCanvas, loadImage } from './spriteLoader';

let sprite: HTMLCanvasElement | null = null;
let loading: Promise<void> | null = null;

function loadWarrior(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const img = await loadImage(warriorUrl);
    sprite = chromaKeyToCanvas(img, { hard: 45, soft: 92 });
  })();
  return loading;
}

void loadWarrior();

/**
 * Draws the boss warrior with smooth gliding movement.
 *
 * `prevPos` + `interpolation` (0..1) blend the warrior between his previous
 * and current grid cell, exactly like the dragon body — so he walks fluidly
 * instead of snapping cell-to-cell. Distances > 1.5 cells (portal jumps)
 * are never interpolated.
 */
export function drawWarrior(
  ctx: CanvasRenderingContext2D,
  pos: Vec2,
  time: number,
  isLight: boolean,
  prevPos: Vec2 | null = null,
  interpolation = 1
): void {
  let gx = pos.x;
  let gy = pos.y;
  if (prevPos) {
    const dist = Math.abs(pos.x - prevPos.x) + Math.abs(pos.y - prevPos.y);
    if (dist > 0 && dist <= 1.5) {
      const t = Math.max(0, Math.min(1, interpolation));
      gx = prevPos.x + (pos.x - prevPos.x) * t;
      gy = prevPos.y + (pos.y - prevPos.y) * t;
    }
  }
  const cx = gx * CELL_SIZE + CELL_SIZE / 2;
  const cy = gy * CELL_SIZE + CELL_SIZE / 2;
  const bob = Math.sin(time * 5) * 1.5;
  const size = CELL_SIZE * 1.18;

  // Threat aura: red in dark mode, copper in light mode
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const aura = ctx.createRadialGradient(cx, cy, 2, cx, cy, CELL_SIZE * 1.1);
  aura.addColorStop(
    0,
    isLight ? 'rgba(190,70,40,0.26)' : 'rgba(255,70,50,0.38)'
  );
  aura.addColorStop(1, 'rgba(255,70,50,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL_SIZE * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ground shadow
  ctx.save();
  ctx.globalAlpha = isLight ? 0.22 : 0.42;
  ctx.fillStyle = '#020302';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + CELL_SIZE * 0.28, CELL_SIZE * 0.34, CELL_SIZE * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (sprite) {
    ctx.drawImage(sprite, cx - size / 2, cy - size / 2 + bob, size, size);
  } else {
    // Fast procedural fallback while the sprite loads
    ctx.fillStyle = '#b8860b';
    ctx.beginPath();
    ctx.arc(cx, cy + bob, CELL_SIZE * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff0c0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 8 + bob);
    ctx.lineTo(cx + 18, cy - 20 + bob);
    ctx.stroke();
  }

  // Small danger marker ring so the rule is readable
  ctx.save();
  const pulse = 0.45 + Math.sin(time * 6) * 0.25;
  ctx.strokeStyle = `rgba(255, 80, 55, ${pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy + bob, CELL_SIZE * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}