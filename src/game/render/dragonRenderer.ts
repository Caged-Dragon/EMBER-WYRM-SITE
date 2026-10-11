/**
 * Smooth DragonSprite renderer for Top-View Dragon Arena.
 *
 * The dragon is still simulated on a grid, but rendering now interpolates
 * every segment between its previous and current cell positions and then
 * samples extra points between neighboring interpolated joints. That turns
 * the painted body sprite set into one continuous, connected dragon body
 * with soft turning and fluid sliding motion.
 */

import { CELL_SIZE, type DirectionName, type Vec2 } from '../constants';
import {
  chromaKeyToCanvas,
  flipHorizontalToCanvas,
  loadImage,
  rotate180ToCanvas,
} from './spriteLoader';

import headUpUrl from '../../assets/dragon/dragon_head_up.png';
import headRightUrl from '../../assets/dragon/dragon_head_right.png';
import bodyUrl from '../../assets/dragon/dragon_body.png';
import tailUrl from '../../assets/dragon/dragon_tail.png';

export enum DragonDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export interface DragonPoint {
  x: number;
  y: number;
}

export interface DragonRenderOptions {
  cellSize?: number;
  scale?: number;
  shadow?: boolean;
  shadowOpacity?: number;
  smoothing?: boolean;
  glowPulse?: number;
  /** 0..1 interpolation between previous and current movement states */
  interpolation?: number;
}

interface LoadedDragonSprites {
  up: CanvasImageSource;
  down: CanvasImageSource;
  left: CanvasImageSource;
  right: CanvasImageSource;
  body: CanvasImageSource;
  tail: CanvasImageSource;
  headUpRatio: number;
  headDownRatio: number;
  headLeftRatio: number;
  headRightRatio: number;
}

const DEFAULT_OPTIONS: Required<DragonRenderOptions> = {
  cellSize: CELL_SIZE,
  scale: 1,
  shadow: true,
  shadowOpacity: 0.32,
  smoothing: true,
  glowPulse: 0,
  interpolation: 1,
};

function angleFromVector(dx: number, dy: number): number {
  return Math.atan2(dy, dx);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: DragonPoint, b: DragonPoint, t: number): DragonPoint {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function catmullRom(
  p0: DragonPoint,
  p1: DragonPoint,
  p2: DragonPoint,
  p3: DragonPoint,
  t: number
): DragonPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function isOrthogonalNeighbor(a: DragonPoint, b: DragonPoint): boolean {
  const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  return d <= 1.01;
}

function directionFromDelta(dx: number, dy: number): DragonDirection {
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? DragonDirection.RIGHT : DragonDirection.LEFT;
  return dy >= 0 ? DragonDirection.DOWN : DragonDirection.UP;
}

export class DragonSprite {
  private sprites: LoadedDragonSprites | null = null;
  private loadingPromise: Promise<void> | null = null;

  public async load(): Promise<void> {
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = (async () => {
      const [upImg, rightImg, bodyImg, tailImg] = await Promise.all([
        loadImage(headUpUrl),
        loadImage(headRightUrl),
        loadImage(bodyUrl),
        loadImage(tailUrl),
      ]);

      const up = chromaKeyToCanvas(upImg);
      const right = chromaKeyToCanvas(rightImg);
      const body = chromaKeyToCanvas(bodyImg);
      const tail = chromaKeyToCanvas(tailImg);

      const down = rotate180ToCanvas(up, up.width, up.height);
      const left = flipHorizontalToCanvas(right, right.width, right.height);

      this.sprites = {
        up,
        down,
        left,
        right,
        body,
        tail,
        headUpRatio: upImg.naturalWidth / upImg.naturalHeight,
        headDownRatio: upImg.naturalWidth / upImg.naturalHeight,
        headLeftRatio: rightImg.naturalWidth / rightImg.naturalHeight,
        headRightRatio: rightImg.naturalWidth / rightImg.naturalHeight,
      };
    })();
    return this.loadingPromise;
  }

  public get isLoaded(): boolean {
    return this.sprites !== null;
  }

  public draw(
    ctx: CanvasRenderingContext2D,
    body: readonly DragonPoint[],
    direction: DragonDirection,
    options: DragonRenderOptions = {},
    previousBody: readonly DragonPoint[] | null = null
  ): void {
    if (!this.sprites || body.length === 0) return;

    const opt = { ...DEFAULT_OPTIONS, ...options };
    ctx.imageSmoothingEnabled = opt.smoothing;
    ctx.imageSmoothingQuality = 'high';

    const interpolated = this.interpolateBody(body, previousBody, opt.interpolation);
    const headDirection = this.headingFor(interpolated, direction);

    // Portal jumps are intentionally split so smoothing never drags a fake
    // body line across the whole arena.
    const runs: DragonPoint[][] = [];
    let currentRun: DragonPoint[] = [interpolated[0]];
    for (let i = 1; i < interpolated.length; i++) {
      if (isOrthogonalNeighbor(interpolated[i - 1], interpolated[i])) currentRun.push(interpolated[i]);
      else {
        runs.push(currentRun);
        currentRun = [interpolated[i]];
      }
    }
    runs.push(currentRun);

    const sampleRuns = runs.map((run) => this.buildSmoothSamples(run.length > 1 ? run : [run[0], run[0]], 5));

    // Ground shadows first
    for (const samples of sampleRuns) {
      for (let i = samples.length - 1; i >= 0; i--) {
        const s = samples[i];
        const progress = i / Math.max(1, samples.length - 1);
        const radius = opt.cellSize * (0.35 - Math.min(0.16, progress * 0.16));
        if (opt.shadow) this.drawShadow(ctx, s.x + opt.cellSize * 0.03, s.y + opt.cellSize * 0.1, radius, opt.shadowOpacity * (1 - progress * 0.25));
      }
    }

    // Tail belongs only to the last continuous run.
    const lastRun = sampleRuns[sampleRuns.length - 1];
    if (lastRun.length > 1) this.drawTailAt(ctx, lastRun, opt);

    for (const samples of sampleRuns) {
      for (let i = samples.length - 1; i >= 1; i--) this.drawBodyAt(ctx, samples, i, opt);
    }

    this.drawHeadAt(ctx, sampleRuns[0][0], headDirection, opt);

    if (opt.glowPulse > 0.01) {
      const headPoint = sampleRuns[0][0];
      const g = ctx.createRadialGradient(
        headPoint.x,
        headPoint.y,
        opt.cellSize * 0.18,
        headPoint.x,
        headPoint.y,
        opt.cellSize * 2.4
      );
      const a = opt.glowPulse * 0.55;
      g.addColorStop(0, `rgba(255, 220, 130, ${a})`);
      g.addColorStop(0.5, `rgba(255, 160, 60, ${a * 0.4})`);
      g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(headPoint.x, headPoint.y, opt.cellSize * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  public drawHead(
    ctx: CanvasRenderingContext2D,
    point: DragonPoint,
    direction: DragonDirection,
    options: DragonRenderOptions = {}
  ): void {
    if (!this.sprites) return;
    const opt = { ...DEFAULT_OPTIONS, ...options };
    const c = this.center(point, opt.cellSize);
    this.drawHeadAt(ctx, c, direction, opt);
  }

  /** Interpolate each current segment toward its previous segment position. */
  private interpolateBody(
    body: readonly DragonPoint[],
    previousBody: readonly DragonPoint[] | null,
    t: number
  ): DragonPoint[] {
    if (!previousBody || previousBody.length === 0) {
      return body.map((p) => ({ ...p }));
    }

    const clamped = Math.max(0, Math.min(1, t));
    return body.map((point, i) => {
      // Current head corresponds to previous head; the rest shift back one.
      const previous = i === 0 ? previousBody[0] : previousBody[i - 1] ?? previousBody[previousBody.length - 1] ?? point;
      // Classic mode wrap/teleport safety: do not drag a line across the map.
      if (!isOrthogonalNeighbor(previous, point)) return { ...point };
      return lerpPoint(previous, point, clamped);
    });
  }

  /** Adds smooth mid-samples between joints while preserving length. */
  private buildSmoothSamples(joints: readonly DragonPoint[], detail: number): DragonPoint[] {
    const padStart = joints[0];
    const padEnd = joints[joints.length - 1];
    const samples: DragonPoint[] = [];
    for (let i = 0; i < joints.length - 1; i++) {
      const p0 = i === 0 ? padStart : joints[i - 1];
      const p1 = joints[i];
      const p2 = joints[i + 1];
      const p3 = i + 2 < joints.length ? joints[i + 2] : padEnd;
      for (let step = 0; step < detail; step++) {
        const t = step / detail;
        samples.push(catmullRom(p0, p1, p2, p3, t));
      }
    }
    samples.push({ ...padEnd });
    return samples.map((p) => ({
      x: p.x * CELL_SIZE + CELL_SIZE / 2,
      y: p.y * CELL_SIZE + CELL_SIZE / 2,
    }));
  }

  private headingFor(samples: readonly DragonPoint[], fallback: DragonDirection): DragonDirection {
    if (samples.length > 1) {
      const dx = samples[0].x - samples[1].x;
      const dy = samples[0].y - samples[1].y;
      if (Math.hypot(dx, dy) > 0.001) return directionFromDelta(dx, dy);
    }
    return fallback;
  }

  private drawBodyAt(
    ctx: CanvasRenderingContext2D,
    samples: readonly DragonPoint[],
    index: number,
    opt: Required<DragonRenderOptions>
  ): void {
    if (!this.sprites) return;
    const current = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    const dx = previous.x - current.x;
    const dy = previous.y - current.y;
    const angle = angleFromVector(dx, dy) + Math.PI / 2;
    const progress = index / Math.max(1, samples.length - 1);
    const scale = opt.scale * (1.0 - Math.min(0.28, progress * 0.26));
    const size = opt.cellSize * 1.12 * scale;
    this.drawRotatedImage(ctx, this.sprites.body, current.x, current.y, size, size, angle);
  }

  private drawTailAt(
    ctx: CanvasRenderingContext2D,
    samples: readonly DragonPoint[],
    opt: Required<DragonRenderOptions>
  ): void {
    if (!this.sprites) return;
    const last = samples[samples.length - 1];
    const before = samples[samples.length - 2];
    const dx = last.x - before.x;
    const dy = last.y - before.y;
    const angle = angleFromVector(dx, dy) - Math.PI / 2;
    const size = opt.cellSize * 0.92 * opt.scale;
    this.drawRotatedImage(ctx, this.sprites.tail, last.x, last.y, size, size * 1.08, angle);
  }

  private drawHeadAt(
    ctx: CanvasRenderingContext2D,
    c: DragonPoint,
    direction: DragonDirection,
    opt: Required<DragonRenderOptions>
  ): void {
    if (!this.sprites) return;
    const { sprite, ratio } = this.getHeadSprite(direction);
    const target = opt.cellSize * 1.24 * opt.scale;
    let width = target;
    let height = target;
    if (ratio > 1) width = target * ratio;
    else if (ratio > 0) height = target / ratio;

    ctx.drawImage(sprite, c.x - width / 2, c.y - height / 2, width, height);
  }

  private getHeadSprite(direction: DragonDirection): {
    sprite: CanvasImageSource;
    ratio: number;
  } {
    if (!this.sprites) throw new Error('Dragon sprites are not loaded.');
    switch (direction) {
      case DragonDirection.UP:
        return { sprite: this.sprites.up, ratio: this.sprites.headUpRatio };
      case DragonDirection.DOWN:
        return { sprite: this.sprites.down, ratio: this.sprites.headDownRatio };
      case DragonDirection.LEFT:
        return { sprite: this.sprites.left, ratio: this.sprites.headLeftRatio };
      case DragonDirection.RIGHT:
        return { sprite: this.sprites.right, ratio: this.sprites.headRightRatio };
    }
  }

  private center(point: DragonPoint, cellSize: number) {
    return {
      x: point.x * cellSize + cellSize / 2,
      y: point.y * cellSize + cellSize / 2,
    };
  }

  private drawRotatedImage(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  private drawShadow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    opacity: number
  ): void {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = '#040a06';
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

let sharedSprite: DragonSprite | null = null;

export function getDragonSprite(): DragonSprite {
  if (!sharedSprite) {
    sharedSprite = new DragonSprite();
    void sharedSprite.load();
  }
  return sharedSprite;
}

export function drawDragon(
  ctx: CanvasRenderingContext2D,
  body: Vec2[],
  direction: DirectionName,
  glowPulse = 0,
  interpolation = 1,
  previousBody: Vec2[] | null = null
): void {
  const sprite = getDragonSprite();
  if (!sprite.isLoaded) return;
  sprite.draw(ctx, body, direction as unknown as DragonDirection, { glowPulse, interpolation }, previousBody);
}
