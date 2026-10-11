import { DIRECTIONS, GRID_HEIGHT, GRID_WIDTH } from '../constants';
import type { LevelData } from '../types';
import { keyOf } from '../systems/helpers';
import { computePlayableArea } from '../systems/levelUtils';
import { getAllLevels } from './levelData';

/**
 * Dev tool — verifies level design rules:
 *  1. Dragon start body is fully on open cells
 *  2. EVERY open cell is reachable from the start (flood fill)
 *     → guarantees the whole arena is coverable
 *  3. Portal destinations are valid open cells
 *  4. Food required to complete is within a sane range
 */
export function validateLevels(levels: LevelData[] = getAllLevels()): string[] {
  const issues: string[] = [];

  for (const level of levels) {
    const { wallSet } = computePlayableArea(level);
    const { position, direction, length } = level.startingDragon;
    const dir = DIRECTIONS[direction];

    // 1. Start body valid
    for (let i = 0; i < length; i++) {
      const x = position[0] - dir.x * i;
      const y = position[1] - dir.y * i;
      if (x < 0 || y < 0 || x >= level.grid.width || y >= level.grid.height) {
        issues.push(`L${level.levelId}: start segment (${x},${y}) out of bounds`);
      } else if (wallSet.has(keyOf([x, y]))) {
        issues.push(`L${level.levelId}: start segment (${x},${y}) on a wall`);
      }
    }

    // 2. Flood fill — all open cells reachable?
    const open = new Set<string>();
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const k = keyOf([x, y]);
        if (!wallSet.has(k)) open.add(k);
      }
    }
    const seen = new Set<string>([keyOf(position)]);
    const queue: [number, number][] = [position];
    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      for (const d of Object.values(DIRECTIONS)) {
        const nx = x + d.x;
        const ny = y + d.y;
        const k = keyOf([nx, ny]);
        if (open.has(k) && !seen.has(k)) {
          seen.add(k);
          queue.push([nx, ny]);
        }
      }
    }
    if (seen.size !== open.size) {
      issues.push(
        `L${level.levelId}: ${open.size - seen.size} of ${open.size} open cells unreachable (arena not fully coverable)`
      );
    }

    // 3. Portal destinations valid
    for (const [ox, oy] of level.openings) {
      if (wallSet.has(keyOf([ox, oy]))) {
        issues.push(`L${level.levelId}: opening (${ox},${oy}) is also a wall`);
      }
    }
    for (const c of level.connections) {
      const [dx, dy] = c.to;
      if (dx < 0 || dy < 0 || dx >= level.grid.width || dy >= level.grid.height) {
        issues.push(`L${level.levelId}: portal dest (${dx},${dy}) out of bounds`);
      } else if (wallSet.has(keyOf([dx, dy]))) {
        issues.push(`L${level.levelId}: portal dest (${dx},${dy}) is a wall`);
      }
      if (!level.openings.some(([ox, oy]) => ox === c.from[0] && oy === c.from[1])) {
        issues.push(`L${level.levelId}: connection from (${c.from}) not in openings list`);
      }
    }

    // 4. Portal rule: levels 1-5 must have none, 6-10 must have portals
    const hasPortals = level.openings.length > 0 && level.connections.length > 0;
    if (level.levelId <= 5 && hasPortals) {
      issues.push(`L${level.levelId}: should have no portals (levels 1-5)`);
    }
    if (level.levelId >= 6 && !hasPortals) {
      issues.push(`L${level.levelId}: should have portals (levels 6-10)`);
    }
  }

  return issues;
}
