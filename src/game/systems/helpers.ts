import type { Vec2 } from '../constants';

export function keyOf(p: Vec2 | [number, number]): string {
  if (Array.isArray(p)) return `${p[0]},${p[1]}`;
  return `${p.x},${p.y}`;
}

export function pos(x: number, y: number): Vec2 {
  return { x, y };
}

export function samePos(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
