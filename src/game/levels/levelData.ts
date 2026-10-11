import { COMPLETION_PERCENTAGES, GRID_HEIGHT, GRID_WIDTH, MAX_LEVEL } from '../constants';
import type { LevelData } from '../types';
import { LEVEL_META, THEMES } from './themes';

type WallList = [number, number][];
type OpeningList = [number, number][];
type ConnList = { from: [number, number]; to: [number, number] }[];

function rect(x1: number, y1: number, x2: number, y2: number): WallList {
  const walls: WallList = [];
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) walls.push([x, y]);
  }
  return walls;
}

function hLine(x1: number, x2: number, y: number): WallList {
  const walls: WallList = [];
  for (let x = x1; x <= x2; x++) walls.push([x, y]);
  return walls;
}

function vLine(x: number, y1: number, y2: number): WallList {
  const walls: WallList = [];
  for (let y = y1; y <= y2; y++) walls.push([x, y]);
  return walls;
}

/** Border ring with optional gaps (gaps become portal openings, levels 6-10 only) */
function border(
  gapTops: number[] = [],
  gapBottoms: number[] = [],
  gapLefts: number[] = [],
  gapRights: number[] = []
): WallList {
  const walls: WallList = [];
  const gt = new Set(gapTops);
  const gb = new Set(gapBottoms);
  const gl = new Set(gapLefts);
  const gr = new Set(gapRights);
  for (let x = 0; x < GRID_WIDTH; x++) {
    if (!gt.has(x)) walls.push([x, 0]);
    if (!gb.has(x)) walls.push([x, GRID_HEIGHT - 1]);
  }
  for (let y = 1; y < GRID_HEIGHT - 1; y++) {
    if (!gl.has(y)) walls.push([0, y]);
    if (!gr.has(y)) walls.push([GRID_WIDTH - 1, y]);
  }
  return walls;
}

/**
 * Pairs each source portal cell with its matching destination cell.
 *
 * IMPORTANT: both arrays must be the same length so every portal cell has
 * a real destination — a mismatched pair previously caused `to: undefined`,
 * which crashed `buildOpeningMap()` the instant the level loaded (this was
 * the root cause of "some levels are not loading"). This function now
 * defends against that by trimming to the shared length so the game can
 * never crash, but every gap group in this file is also kept the same
 * length on both sides so nothing gets silently dropped either.
 */
function pairOpenings(openings: OpeningList, destinations: OpeningList): ConnList {
  if (openings.length !== destinations.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[levelData] Mismatched portal gap sizes (${openings.length} vs ${destinations.length}) — trimming to avoid a broken portal.`
    );
  }
  const len = Math.min(openings.length, destinations.length);
  return openings.slice(0, len).map((from, i) => ({ from, to: destinations[i] }));
}

function uniq(walls: WallList): WallList {
  const s = new Set<string>();
  const out: WallList = [];
  for (const [x, y] of walls) {
    const k = `${x},${y}`;
    if (!s.has(k)) {
      s.add(k);
      out.push([x, y]);
    }
  }
  return out;
}

function makeLevel(
  id: number,
  walls: WallList,
  openings: OpeningList = [],
  connections: ConnList = [],
  start: [number, number] = [12, 9],
  dir: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN' = 'RIGHT',
  length = 4
): LevelData {
  const bossTier = id >= 1000 ? id - 1000 : 0;
  const bossMeta =
    bossTier === 1
      ? { id, name: 'Warrior Ambush', theme: 'dark_forest' }
      : bossTier === 2
        ? { id, name: 'Portal Duel', theme: 'dragons_lair' }
        : { id, name: 'Asymmetric Hunt', theme: 'obsidian_court' };
  const meta = id >= 1000 ? bossMeta : LEVEL_META[id - 1];
  return {
    levelId: id,
    name: meta.name,
    theme: meta.theme,
    grid: { width: GRID_WIDTH, height: GRID_HEIGHT },
    startingDragon: { position: start, direction: dir, length },
    completion: { percentage: id >= 1000 ? 0 : COMPLETION_PERCENTAGES[id] },
    walls: uniq(walls),
    openings,
    connections,
    food: { normalPoints: 1, growth: 1, finalPoints: 5 },
    environment: {
      background: meta.theme,
      wallStyle: meta.theme,
      colors: THEMES[meta.theme],
    },
  };
}

/* ================= LEVELS 1-5: NO PORTALS ================= */

/* ------------------------------------------------------------------
 * LEVEL 1 — Green Meadow (BASIC)
 * Pattern: pure open arena — border walls only.
 * ------------------------------------------------------------------ */
function level01(): LevelData {
  return makeLevel(1, border(), [], [], [12, 9], 'RIGHT', 4);
}

/* ------------------------------------------------------------------
 * LEVEL 2 — Desert Ruins
 * Pattern: four 2x2 corner pillars + one short center bar.
 * ------------------------------------------------------------------ */
function level02(): LevelData {
  const walls: WallList = [
    ...border(),
    ...rect(4, 4, 5, 5),
    ...rect(18, 4, 19, 5),
    ...rect(4, 12, 5, 13),
    ...rect(18, 12, 19, 13),
    ...hLine(10, 13, 8),
  ];
  return makeLevel(2, walls, [], [], [4, 9], 'RIGHT', 4);
}

/* ------------------------------------------------------------------
 * LEVEL 3 — Ocean Temple
 * Pattern: two thin columns (wide gaps each) + tiny center island.
 * ------------------------------------------------------------------ */
function level03(): LevelData {
  const walls: WallList = [
    ...border(),
    ...vLine(7, 3, 7),
    ...vLine(7, 10, 14),
    ...vLine(16, 3, 7),
    ...vLine(16, 10, 14),
    ...rect(11, 8, 12, 9),
  ];
  return makeLevel(3, walls, [], [], [4, 9], 'RIGHT', 4);
}

/* ------------------------------------------------------------------
 * LEVEL 4 — Lava Arena
 * Pattern: broken diamond ring — 4 lava arcs, wide gaps at
 * north / south / east / west. Inside and outside connect freely.
 * ------------------------------------------------------------------ */
function level04(): LevelData {
  const walls: WallList = [
    ...border(),
    // diamond arcs (gaps left open at the 4 cardinal points)
    [10, 5], [13, 5],
    [9, 6], [14, 6],
    [8, 7], [15, 7],
    [8, 10], [15, 10],
    [9, 11], [14, 11],
    [10, 12], [13, 12],
  ];
  return makeLevel(4, walls, [], [], [4, 9], 'RIGHT', 4);
}

/* ------------------------------------------------------------------
 * LEVEL 5 — Dark Forest
 * Pattern: two horizontal banded rows (each with 2 wide gaps)
 * + 2 lone trees.
 * ------------------------------------------------------------------ */
function level05(): LevelData {
  const walls: WallList = [
    ...border(),
    ...hLine(3, 9, 5),
    ...hLine(12, 20, 5),
    ...hLine(3, 11, 12),
    ...hLine(14, 20, 12),
    [7, 8],
    [16, 9],
  ];
  return makeLevel(5, walls, [], [], [12, 2], 'RIGHT', 4);
}

/* ============= LEVELS 6-10: COMPLEX PORTALS ============= */

/* ------------------------------------------------------------------
 * LEVEL 6 — Frozen Cave  · 16 portals
 * Pattern: two staircase zigzag walls + short bar.
 * Portals: top<->bottom cross-swap (4) and left<->right cross-swap (4)
 * on each side — 8 border gaps, 16 portal cells.
 * ------------------------------------------------------------------ */
function level06(): LevelData {
  const top = [3, 4, 5, 6];
  const bottom = [17, 18, 19, 20];
  const left = [2, 3, 4, 5];
  const right = [12, 13, 14, 15];
  const walls: WallList = [
    ...border(top, bottom, left, right),
    // left staircase
    [2, 4], [3, 4], [3, 5], [4, 5], [4, 6], [5, 6],
    // right staircase (mirrored)
    [21, 13], [20, 13], [20, 12], [19, 12], [19, 11], [18, 11],
    // short center bar
    [10, 9], [13, 9],
  ];
  const openings: OpeningList = [
    ...top.map((x) => [x, 0] as [number, number]),
    ...bottom.map((x) => [x, 17] as [number, number]),
    ...left.map((y) => [0, y] as [number, number]),
    ...right.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...top.map((x, i): ConnList[number] => ({ from: [x, 0], to: [bottom[i], 16] })),
    ...bottom.map((x, i): ConnList[number] => ({ from: [x, 17], to: [top[i], 1] })),
    ...left.map((y, i): ConnList[number] => ({ from: [0, y], to: [22, left[i]] })),
    ...right.map((y, i): ConnList[number] => ({ from: [23, y], to: [1, right[i]] })),
  ];
  return makeLevel(6, walls, openings, connections, [12, 2], 'RIGHT', 4);
}

/* ------------------------------------------------------------------
 * LEVEL 7 — Ancient Temple  · 8 portals
 *
 * FULLY SYMMETRIC LAYOUT (all gaps consistent 2 cells, all centered):
 *   Ring:      x = 6..17, y = 4..13   (center 11.5, 8.5)
 *   Ring gaps: top/bottom at x = 11,12   left/right at y = 8,9
 *   Altar:     2x2 dead-center at (11,8)-(12,9)
 *   Turrets:   four 2x2 blocks mirrored on both axes
 *   Border gaps line up exactly with the ring gaps.
 *   Portals are straight wrap-throughs, so every gap is reversible.
 * ------------------------------------------------------------------ */
function level07(): LevelData {
  const walls: WallList = [
    // Border gaps aligned with the ring gaps (x 11,12 and y 8,9)
    ...border([10, 11, 12, 13], [10, 11, 12, 13], [7, 8, 9, 10], [7, 8, 9, 10]),

    // ── hollow ring, every side gapped 2 cells dead-center ──
    // top row y=4, gap x=11,12
    ...hLine(6, 10, 4),
    ...hLine(13, 17, 4),
    // bottom row y=13, gap x=11,12
    ...hLine(6, 10, 13),
    ...hLine(13, 17, 13),
    // left col x=6, gap y=8,9
    ...vLine(6, 4, 7),
    ...vLine(6, 10, 13),
    // right col x=17, gap y=8,9
    ...vLine(17, 4, 7),
    ...vLine(17, 10, 13),

    // ── four symmetric 2x2 corner turrets ──
    ...rect(3, 2, 4, 3),
    ...rect(19, 2, 20, 3),
    ...rect(3, 14, 4, 15),
    ...rect(19, 14, 20, 15),

    // ── 2x2 altar, perfectly centered inside the ring ──
    ...rect(11, 8, 12, 9),
  ];
  const topGap = [10, 11, 12, 13];
  const sideGap = [7, 8, 9, 10];
  const openings: OpeningList = [
    ...topGap.map((x) => [x, 0] as [number, number]),
    ...topGap.map((x) => [x, 17] as [number, number]),
    ...sideGap.map((y) => [0, y] as [number, number]),
    ...sideGap.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...topGap.map((x): ConnList[number] => ({ from: [x, 0], to: [x, 16] })),
    ...topGap.map((x): ConnList[number] => ({ from: [x, 17], to: [x, 1] })),
    ...sideGap.map((y): ConnList[number] => ({ from: [0, y], to: [22, y] })),
    ...sideGap.map((y): ConnList[number] => ({ from: [23, y], to: [1, y] })),
  ];
  // Start inside the ring, clear of the altar
  return makeLevel(7, walls, openings, connections, [10, 6], 'RIGHT', 4);
}

/* ------------------------------------------------------------------
 * LEVEL 8 — Space Station  · 8 portals
 * Pattern: one giant PLUS cross (2x2-thick arms) with open center.
 * Portals: top<->bottom diagonal swap + left<->right diagonal swap.
 * ------------------------------------------------------------------ */
function level08(): LevelData {
  const walls: WallList = [
    ...border([3, 4, 5, 6, 17, 18, 19, 20], [3, 4, 5, 6, 17, 18, 19, 20], [2, 3, 4, 5, 13, 14, 15, 16], [2, 3, 4, 5, 13, 14, 15, 16]),
    ...rect(11, 2, 12, 5),
    ...rect(11, 12, 12, 15),
    ...rect(2, 8, 5, 9),
    ...rect(18, 8, 21, 9),
  ];
  const topGap = [3, 4, 5, 6, 17, 18, 19, 20];
  const sideGap = [2, 3, 4, 5, 13, 14, 15, 16];
  const openings: OpeningList = [
    ...topGap.map((x) => [x, 0] as [number, number]),
    ...topGap.map((x) => [x, 17] as [number, number]),
    ...sideGap.map((y) => [0, y] as [number, number]),
    ...sideGap.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...topGap.map((x, i): ConnList[number] => ({ from: [x, 0], to: [topGap[topGap.length - 1 - i], 16] })),
    ...topGap.map((x, i): ConnList[number] => ({ from: [x, 17], to: [topGap[topGap.length - 1 - i], 1] })),
    ...sideGap.map((y, i): ConnList[number] => ({ from: [0, y], to: [22, sideGap[sideGap.length - 1 - i]] })),
    ...sideGap.map((y, i): ConnList[number] => ({ from: [23, y], to: [1, sideGap[sideGap.length - 1 - i]] })),
  ];
  return makeLevel(8, walls, openings, connections, [3, 3], 'RIGHT', 4);
}

/* ------------------------------------------------------------------
 * LEVEL 9 — Electric Laboratory  · 8 portals
 * Pattern: three staggered 2-wide pillar blocks (comb layout).
 * Portals: vertical through-teleport + horizontal low-band swap.
 * ------------------------------------------------------------------ */
function level09(): LevelData {
  const walls: WallList = [
    ...border([6, 7, 8, 9], [6, 7, 8, 9], [13, 14, 15, 16], [13, 14, 15, 16]),
    ...rect(5, 4, 6, 8),
    ...rect(11, 3, 12, 7),
    ...rect(17, 10, 18, 14),
  ];
  const topGap = [6, 7, 8, 9];
  const sideGap = [13, 14, 15, 16];
  const openings: OpeningList = [
    ...topGap.map((x) => [x, 0] as [number, number]),
    ...topGap.map((x) => [x, 17] as [number, number]),
    ...sideGap.map((y) => [0, y] as [number, number]),
    ...sideGap.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...topGap.map((x): ConnList[number] => ({ from: [x, 0], to: [x, 16] })),
    ...topGap.map((x): ConnList[number] => ({ from: [x, 17], to: [x, 1] })),
    ...sideGap.map((y): ConnList[number] => ({ from: [0, y], to: [22, y] })),
    ...sideGap.map((y): ConnList[number] => ({ from: [23, y], to: [1, y] })),
  ];
  return makeLevel(9, walls, openings, connections, [12, 16], 'RIGHT', 4);
}

/* ------------------------------------------------------------------
 * LEVEL 10 — Dragon's Lair  · 8 portals
 * Pattern: four corner nests + central cross throne + two side
 * gate columns with wide mid gates. Portals: top<->bottom and
 * left<->right corner swaps.
 * ------------------------------------------------------------------ */
function level10(): LevelData {
  // Two clean 4-wide passages per side — consistent with Levels 6, 7 and 9
  // (previously this level mixed 3-wide and 4-wide gaps, which felt broken).
  const topGap = [3, 4, 5, 6, 17, 18, 19, 20];
  const sideGap = [2, 3, 4, 5, 13, 14, 15, 16];
  const walls: WallList = [
    ...border(topGap, topGap, sideGap, sideGap),
    // corner nests
    ...rect(3, 3, 4, 4),
    ...rect(19, 3, 20, 4),
    ...rect(3, 13, 4, 14),
    ...rect(19, 13, 20, 14),
    // central cross throne
    ...rect(11, 7, 12, 10),
    ...hLine(9, 14, 8),
    ...hLine(9, 14, 9),
    // side gate columns (wide 4-cell mid gates at y7-10)
    ...vLine(6, 4, 6),
    ...vLine(6, 11, 13),
    ...vLine(17, 4, 6),
    ...vLine(17, 11, 13),
  ];
  const openings: OpeningList = [
    ...topGap.map((x) => [x, 0] as [number, number]),
    ...topGap.map((x) => [x, 17] as [number, number]),
    ...sideGap.map((y) => [0, y] as [number, number]),
    ...sideGap.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...topGap.map((x, i): ConnList[number] => ({ from: [x, 0], to: [topGap[topGap.length - 1 - i], 16] })),
    ...topGap.map((x, i): ConnList[number] => ({ from: [x, 17], to: [topGap[topGap.length - 1 - i], 1] })),
    ...sideGap.map((y, i): ConnList[number] => ({ from: [0, y], to: [22, sideGap[sideGap.length - 1 - i]] })),
    ...sideGap.map((y, i): ConnList[number] => ({ from: [23, y], to: [1, sideGap[sideGap.length - 1 - i]] })),
  ];
  return makeLevel(10, walls, openings, connections, [9, 3], 'RIGHT', 4);
}

/* ============= LEVELS 11-15: NON-SYMMETRIC PORTALS ============= */

function level11(): LevelData {
  const topA = [3, 4, 5], topB = [14, 15, 16];
  const bottomA = [8, 9, 10], bottomB = [20, 21, 22];
  const leftA = [5, 6, 7], leftB = [14, 15, 16];
  const rightA = [9, 10, 11], rightB = [15, 16, 17];
  const openings: OpeningList = [
    ...topA.map((x) => [x, 0] as [number, number]),
    ...topB.map((x) => [x, 0] as [number, number]),
    ...bottomA.map((x) => [x, 17] as [number, number]),
    ...bottomB.map((x) => [x, 17] as [number, number]),
    ...leftA.map((y) => [0, y] as [number, number]),
    ...leftB.map((y) => [0, y] as [number, number]),
    ...rightA.map((y) => [23, y] as [number, number]),
    ...rightB.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...pairOpenings(topA.map((x) => [x, 0] as [number, number]), bottomB.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(topB.map((x) => [x, 0] as [number, number]), bottomA.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(bottomA.map((x) => [x, 17] as [number, number]), topB.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(bottomB.map((x) => [x, 17] as [number, number]), topA.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(leftA.map((y) => [0, y] as [number, number]), rightB.map((y) => [22, y] as [number, number])),
    ...pairOpenings(leftB.map((y) => [0, y] as [number, number]), rightA.map((y) => [22, y] as [number, number])),
    ...pairOpenings(rightA.map((y) => [23, y] as [number, number]), leftB.map((y) => [1, y] as [number, number])),
    ...pairOpenings(rightB.map((y) => [23, y] as [number, number]), leftA.map((y) => [1, y] as [number, number])),
  ];
  const walls: WallList = [
    ...border([...topA, ...topB], [...bottomA, ...bottomB], [...leftA, ...leftB], [...rightA, ...rightB]),
    ...hLine(6, 12, 4),
    ...vLine(18, 4, 9),
    ...hLine(2, 7, 13),
    ...rect(14, 10, 15, 11),
  ];
  return makeLevel(11, walls, openings, connections, [4, 2], 'RIGHT', 4);
}

function level12(): LevelData {
  // Every paired passage (A<->B) is kept the SAME width on both ends so no
  // portal cell is ever left without a destination.
  const topA = [5, 6, 7], topB = [18, 19, 20, 21];
  const bottomA = [2, 3, 4, 5], bottomB = [12, 13, 14];
  const leftA = [2, 3, 4], leftB = [14, 15, 16];
  const rightA = [7, 8, 9], rightB = [14, 15, 16];
  const openings: OpeningList = [
    ...topA.map((x) => [x, 0] as [number, number]),
    ...topB.map((x) => [x, 0] as [number, number]),
    ...bottomA.map((x) => [x, 17] as [number, number]),
    ...bottomB.map((x) => [x, 17] as [number, number]),
    ...leftA.map((y) => [0, y] as [number, number]),
    ...leftB.map((y) => [0, y] as [number, number]),
    ...rightA.map((y) => [23, y] as [number, number]),
    ...rightB.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...pairOpenings(topA.map((x) => [x, 0] as [number, number]), bottomB.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(topB.map((x) => [x, 0] as [number, number]), bottomA.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(bottomA.map((x) => [x, 17] as [number, number]), topB.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(bottomB.map((x) => [x, 17] as [number, number]), topA.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(leftA.map((y) => [0, y] as [number, number]), rightB.map((y) => [22, y] as [number, number])),
    ...pairOpenings(leftB.map((y) => [0, y] as [number, number]), rightA.map((y) => [22, y] as [number, number])),
    ...pairOpenings(rightA.map((y) => [23, y] as [number, number]), leftB.map((y) => [1, y] as [number, number])),
    ...pairOpenings(rightB.map((y) => [23, y] as [number, number]), leftA.map((y) => [1, y] as [number, number])),
  ];
  const walls: WallList = [
    ...border([...topA, ...topB], [...bottomA, ...bottomB], [...leftA, ...leftB], [...rightA, ...rightB]),
    ...vLine(4, 5, 11),
    ...hLine(9, 17, 6),
    ...vLine(20, 10, 15),
    ...rect(11, 12, 12, 13),
  ];
  return makeLevel(12, walls, openings, connections, [12, 2], 'RIGHT', 4);
}

function level13(): LevelData {
  // Every paired passage (A<->B) is kept the SAME width on both ends so no
  // portal cell is ever left without a destination.
  const topA = [9, 10, 11], topB = [17, 18, 19];
  const bottomA = [3, 4, 5], bottomB = [14, 15, 16];
  const leftA = [6, 7, 8], leftB = [13, 14, 15];
  const rightA = [2, 3, 4], rightB = [10, 11, 12];
  const openings: OpeningList = [
    ...topA.map((x) => [x, 0] as [number, number]),
    ...topB.map((x) => [x, 0] as [number, number]),
    ...bottomA.map((x) => [x, 17] as [number, number]),
    ...bottomB.map((x) => [x, 17] as [number, number]),
    ...leftA.map((y) => [0, y] as [number, number]),
    ...leftB.map((y) => [0, y] as [number, number]),
    ...rightA.map((y) => [23, y] as [number, number]),
    ...rightB.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...pairOpenings(topA.map((x) => [x, 0] as [number, number]), bottomB.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(topB.map((x) => [x, 0] as [number, number]), bottomA.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(bottomA.map((x) => [x, 17] as [number, number]), topB.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(bottomB.map((x) => [x, 17] as [number, number]), topA.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(leftA.map((y) => [0, y] as [number, number]), rightB.map((y) => [22, y] as [number, number])),
    ...pairOpenings(leftB.map((y) => [0, y] as [number, number]), rightA.map((y) => [22, y] as [number, number])),
    ...pairOpenings(rightA.map((y) => [23, y] as [number, number]), leftB.map((y) => [1, y] as [number, number])),
    ...pairOpenings(rightB.map((y) => [23, y] as [number, number]), leftA.map((y) => [1, y] as [number, number])),
  ];
  const walls: WallList = [
    ...border([...topA, ...topB], [...bottomA, ...bottomB], [...leftA, ...leftB], [...rightA, ...rightB]),
    ...hLine(3, 10, 5),
    ...hLine(12, 20, 10),
    ...vLine(8, 11, 15),
    ...rect(15, 3, 16, 4),
  ];
  return makeLevel(13, walls, openings, connections, [4, 14], 'RIGHT', 4);
}

function level14(): LevelData {
  // Every paired passage (A<->B) is kept the SAME width on both ends so no
  // portal cell is ever left without a destination.
  const topA = [2, 3, 4], topB = [16, 17, 18];
  const bottomA = [10, 11, 12], bottomB = [18, 19, 20];
  const leftA = [4, 5, 6, 7], leftB = [12, 13, 14];
  const rightA = [6, 7, 8], rightB = [14, 15, 16, 17];
  const openings: OpeningList = [
    ...topA.map((x) => [x, 0] as [number, number]),
    ...topB.map((x) => [x, 0] as [number, number]),
    ...bottomA.map((x) => [x, 17] as [number, number]),
    ...bottomB.map((x) => [x, 17] as [number, number]),
    ...leftA.map((y) => [0, y] as [number, number]),
    ...leftB.map((y) => [0, y] as [number, number]),
    ...rightA.map((y) => [23, y] as [number, number]),
    ...rightB.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...pairOpenings(topA.map((x) => [x, 0] as [number, number]), bottomB.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(topB.map((x) => [x, 0] as [number, number]), bottomA.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(bottomA.map((x) => [x, 17] as [number, number]), topB.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(bottomB.map((x) => [x, 17] as [number, number]), topA.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(leftA.map((y) => [0, y] as [number, number]), rightB.map((y) => [22, y] as [number, number])),
    ...pairOpenings(leftB.map((y) => [0, y] as [number, number]), rightA.map((y) => [22, y] as [number, number])),
    ...pairOpenings(rightA.map((y) => [23, y] as [number, number]), leftB.map((y) => [1, y] as [number, number])),
    ...pairOpenings(rightB.map((y) => [23, y] as [number, number]), leftA.map((y) => [1, y] as [number, number])),
  ];
  const walls: WallList = [
    ...border([...topA, ...topB], [...bottomA, ...bottomB], [...leftA, ...leftB], [...rightA, ...rightB]),
    ...rect(4, 4, 8, 5),
    ...rect(14, 3, 15, 8),
    ...hLine(6, 17, 12),
    ...vLine(20, 9, 14),
  ];
  return makeLevel(14, walls, openings, connections, [3, 15], 'RIGHT', 4);
}

function level15(): LevelData {
  // Every paired passage (A<->B) is kept the SAME width on both ends so no
  // portal cell is ever left without a destination.
  const topA = [6, 7, 8], topB = [20, 21, 22];
  const bottomA = [3, 4, 5], bottomB = [14, 15, 16];
  const leftA = [8, 9, 10, 11], leftB = [14, 15, 16];
  const rightA = [4, 5, 6], rightB = [12, 13, 14, 15];
  const openings: OpeningList = [
    ...topA.map((x) => [x, 0] as [number, number]),
    ...topB.map((x) => [x, 0] as [number, number]),
    ...bottomA.map((x) => [x, 17] as [number, number]),
    ...bottomB.map((x) => [x, 17] as [number, number]),
    ...leftA.map((y) => [0, y] as [number, number]),
    ...leftB.map((y) => [0, y] as [number, number]),
    ...rightA.map((y) => [23, y] as [number, number]),
    ...rightB.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...pairOpenings(topA.map((x) => [x, 0] as [number, number]), bottomB.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(topB.map((x) => [x, 0] as [number, number]), bottomA.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(bottomA.map((x) => [x, 17] as [number, number]), topB.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(bottomB.map((x) => [x, 17] as [number, number]), topA.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(leftA.map((y) => [0, y] as [number, number]), rightB.map((y) => [22, y] as [number, number])),
    ...pairOpenings(leftB.map((y) => [0, y] as [number, number]), rightA.map((y) => [22, y] as [number, number])),
    ...pairOpenings(rightA.map((y) => [23, y] as [number, number]), leftB.map((y) => [1, y] as [number, number])),
    ...pairOpenings(rightB.map((y) => [23, y] as [number, number]), leftA.map((y) => [1, y] as [number, number])),
  ];
  const walls: WallList = [
    ...border([...topA, ...topB], [...bottomA, ...bottomB], [...leftA, ...leftB], [...rightA, ...rightB]),
    ...vLine(5, 3, 9),
    ...hLine(9, 18, 4),
    ...rect(11, 8, 13, 10),
    ...hLine(4, 14, 14),
    ...vLine(19, 9, 15),
  ];
  return makeLevel(15, walls, openings, connections, [12, 16], 'RIGHT', 4);
}

export function getBossLevel(tier: number): LevelData {
  if (tier === 1) {
    // Start [12,15] RIGHT: body occupies x5..12 on row 15 — fully inside
    // the arena and clear of every wall. (The old UP-facing start pushed
    // the 8-segment tail out of the grid entirely.)
    return makeLevel(
      1001,
      [...border(), ...rect(5, 4, 6, 5), ...rect(17, 12, 18, 13), ...hLine(10, 13, 8)],
      [],
      [],
      [12, 15],
      'RIGHT',
      8
    );
  }
  if (tier === 2) {
    const top = [10, 11, 12, 13], side = [7, 8, 9, 10];
    const openings: OpeningList = [
      ...top.map((x) => [x, 0] as [number, number]), ...top.map((x) => [x, 17] as [number, number]),
      ...side.map((y) => [0, y] as [number, number]), ...side.map((y) => [23, y] as [number, number]),
    ];
    const connections: ConnList = [
      ...top.map((x): ConnList[number] => ({ from: [x, 0], to: [x, 16] })),
      ...top.map((x): ConnList[number] => ({ from: [x, 17], to: [x, 1] })),
      ...side.map((y): ConnList[number] => ({ from: [0, y], to: [22, y] })),
      ...side.map((y): ConnList[number] => ({ from: [23, y], to: [1, y] })),
    ];
    // Start [12,15] RIGHT: body x5..12 on row 15, fully in-bounds. (The old
    // [3,15] start placed most of the 8-segment tail at negative x.)
    return makeLevel(
      1002,
      [...border(top, top, side, side), ...rect(5, 5, 6, 6), ...rect(17, 11, 18, 12), ...rect(11, 8, 12, 9)],
      openings,
      connections,
      [12, 15],
      'RIGHT',
      8
    );
  }
  const topA = [3, 4, 5], topB = [15, 16, 17];
  const bottomA = [8, 9, 10], bottomB = [19, 20, 21];
  const leftA = [5, 6, 7], leftB = [14, 15, 16];
  const rightA = [9, 10, 11], rightB = [15, 16, 17];
  const openings: OpeningList = [
    ...topA.map((x) => [x, 0] as [number, number]), ...topB.map((x) => [x, 0] as [number, number]),
    ...bottomA.map((x) => [x, 17] as [number, number]), ...bottomB.map((x) => [x, 17] as [number, number]),
    ...leftA.map((y) => [0, y] as [number, number]), ...leftB.map((y) => [0, y] as [number, number]),
    ...rightA.map((y) => [23, y] as [number, number]), ...rightB.map((y) => [23, y] as [number, number]),
  ];
  const connections: ConnList = [
    ...pairOpenings(topA.map((x) => [x, 0] as [number, number]), bottomB.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(topB.map((x) => [x, 0] as [number, number]), bottomA.map((x) => [x, 16] as [number, number])),
    ...pairOpenings(bottomA.map((x) => [x, 17] as [number, number]), topB.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(bottomB.map((x) => [x, 17] as [number, number]), topA.map((x) => [x, 1] as [number, number])),
    ...pairOpenings(leftA.map((y) => [0, y] as [number, number]), rightB.map((y) => [22, y] as [number, number])),
    ...pairOpenings(leftB.map((y) => [0, y] as [number, number]), rightA.map((y) => [22, y] as [number, number])),
    ...pairOpenings(rightA.map((y) => [23, y] as [number, number]), leftB.map((y) => [1, y] as [number, number])),
    ...pairOpenings(rightB.map((y) => [23, y] as [number, number]), leftA.map((y) => [1, y] as [number, number])),
  ];
  // Start [12,15] RIGHT: body x5..12 on row 15 — in-bounds and clear of the
  // x6 wall column (which only spans y4..12). The old UP-facing start pushed
  // the tail out of the grid.
  return makeLevel(
    1003,
    [...border([...topA, ...topB], [...bottomA, ...bottomB], [...leftA, ...leftB], [...rightA, ...rightB]), ...vLine(6, 4, 12), ...hLine(10, 18, 5), ...rect(14, 11, 15, 12)],
    openings,
    connections,
    [12, 15],
    'RIGHT',
    8
  );
}

const LEVEL_BUILDERS = [
  level01, level02, level03, level04, level05,
  level06, level07, level08, level09, level10,
  level11, level12, level13, level14, level15,
];

export function getLevel(id: number): LevelData {
  const idx = Math.max(1, Math.min(MAX_LEVEL, id)) - 1;
  return LEVEL_BUILDERS[idx]();
}

export function getAllLevels(): LevelData[] {
  return LEVEL_BUILDERS.map((b) => b());
}

/** Classic mode uses an empty open arena with wrapping */
export function getClassicLevel(): LevelData {
  return {
    levelId: 0,
    name: 'Classic Arena',
    theme: 'green_meadow',
    grid: { width: GRID_WIDTH, height: GRID_HEIGHT },
    startingDragon: { position: [12, 9], direction: 'RIGHT', length: 4 },
    completion: { percentage: 0 },
    walls: [],
    openings: [],
    connections: [],
    food: { normalPoints: 1, growth: 1, finalPoints: 5 },
    environment: {
      background: 'green_meadow',
      wallStyle: 'classic',
      colors: THEMES.green_meadow,
    },
  };
}
