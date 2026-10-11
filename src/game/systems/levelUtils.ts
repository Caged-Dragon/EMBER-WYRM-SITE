import { GRID_HEIGHT, GRID_WIDTH } from '../constants';
import type { LevelData } from '../types';
import { keyOf } from './helpers';

/** Compute playable cells (not walls) and required dragon length */
export function computePlayableArea(level: LevelData): {
  playableArea: number;
  requiredLength: number;
  wallSet: Set<string>;
} {
  const wallSet = new Set<string>();
  for (const [x, y] of level.walls) {
    wallSet.add(keyOf([x, y]));
  }

  // Openings are walkable (not walls)
  let playable = 0;
  for (let y = 0; y < (level.grid.height || GRID_HEIGHT); y++) {
    for (let x = 0; x < (level.grid.width || GRID_WIDTH); x++) {
      if (!wallSet.has(keyOf([x, y]))) playable++;
    }
  }

  const requiredLength = Math.ceil(playable * level.completion.percentage);
  return { playableArea: playable, requiredLength, wallSet };
}

export function buildOpeningMap(
  level: LevelData
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  for (const conn of level.connections) {
    map.set(keyOf(conn.from), { x: conn.to[0], y: conn.to[1] });
  }
  return map;
}
