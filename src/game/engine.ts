import {
  BONUS_DURATION,
  DIRECTIONS,
  GAME_MODES,
  GRID_HEIGHT,
  GRID_WIDTH,
  MAX_LEVEL,
  OPPOSITE,
  SPEEDS,
  type DirectionName,
  type GameMode,
  type SpeedName,
  type Vec2,
} from './constants';
import { getBossLevel, getClassicLevel, getLevel } from './levels/levelData';
import { keyOf, samePos } from './systems/helpers';
import { buildOpeningMap, computePlayableArea } from './systems/levelUtils';
import {
  clampFoodLimit,
  clearSave,
  loadSave,
  loadSettings,
  updateHighScore,
  writeSave,
} from './systems/saveManager';
import type {
  BonusFoodState,
  DragonState,
  FoodState,
  LevelData,
  RuntimeGameData,
  WarriorState,
} from './types';

export type EngineEvent =
  | { type: 'none' }
  | { type: 'game_over'; reason: string }
  | { type: 'level_complete'; score: number }
  | { type: 'final_victory'; score: number }
  | { type: 'ate_food'; points: number; isFinal: boolean }
  | { type: 'bonus_spawned' }
  | { type: 'bonus_expired' }
  | { type: 'boss_trapped'; tier: number };

function createDragon(level: LevelData): DragonState {
  const { position, direction, length } = level.startingDragon;
  const dir = DIRECTIONS[direction];
  const body: Vec2[] = [];
  for (let i = 0; i < length; i++) {
    body.push({
      x: position[0] - dir.x * i,
      y: position[1] - dir.y * i,
    });
  }
  return {
    body,
    direction,
    pendingDirection: null,
    growPending: 0,
  };
}

function randomEmptyCell(
  walls: Set<string>,
  occupied: Set<string>,
  w: number,
  h: number
): Vec2 | null {
  const free: Vec2[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = keyOf([x, y]);
      if (!walls.has(k) && !occupied.has(k)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)];
}

export class GameEngine {
  mode: GameMode = GAME_MODES.LEVEL_BASED;
  levelId = 1;
  speed: SpeedName = 'Mid';
  score = 0;
  highScore = 0;
  level: LevelData;
  dragon: DragonState;
  food: FoodState = { position: null, isFinal: false };
  /**
   * Constant mode only — the timed 5-point fruit that coexists with the
   * normal 1-point fruit. Player must choose which to chase.
   */
  bonusFood: BonusFoodState = { position: null, timeLeft: 0, maxTime: 0 };
  warrior: WarriorState = { position: null, moveCooldown: 0 };
  /** Previous warrior cell — used to render smooth gliding movement. */
  warriorPrev: Vec2 | null = null;
  /** The cell the warrior came from — avoids jittery back-and-forth motion. */
  private warriorCameFrom: Vec2 | null = null;
  /** 2 moves for every 3 dragon steps = exactly 2/3 of dragon speed. */
  private warriorPhase = 0;
  bossWarriorVulnerable = false;
  isBossFight = false;
  bossTier = 0;
  finalFoodSpawned = false;
  /** How many normal foods the player must eat before the Final Food appears */
  foodLimit = 0;
  /** Normal foods eaten in the current level */
  foodsEaten = 0;
  requiredLength = 0;
  playableArea = 0;
  walls = new Set<string>();
  openings = new Map<string, Vec2>();
  tick = 0;
  alive = true;
  levelComplete = false;
  finalVictory = false;
  gameOverReason = '';
  /** If true, the dragon waits until the player presses a move key */
  waitingToStart = true;
  private acc = 0;
  private occupiedCache = new Set<string>();
  private previousBody: Vec2[] = [];
  private stepDuration = 0.125;
  private lastStepAt = 0;

  constructor() {
    const settings = loadSettings();
    this.speed = settings.speed;
    this.level = getClassicLevel();
    this.dragon = createDragon(this.level);
  }

  get movesPerSecond(): number {
    return SPEEDS[this.speed];
  }

  /** 0..1 progress toward the Final Food (foods eaten / limit) */
  get progress(): number {
    if (this.foodLimit <= 0) return 0;
    return Math.min(1, this.foodsEaten / this.foodLimit);
  }

  get dragonLength(): number {
    return this.dragon.body.length;
  }

  get previousDragonBody(): Vec2[] {
    return this.previousBody;
  }

  get interpolation(): number {
    if (this.stepDuration <= 0) return 1;
    return Math.max(0, Math.min(1, this.lastStepAt / this.stepDuration));
  }

  beginFrame(dt: number): void {
    this.lastStepAt = Math.min(this.stepDuration, this.lastStepAt + dt);
  }

  private snapshotPreviousBody(): void {
    this.previousBody = this.dragon.body.map((p) => ({ ...p }));
  }

  private resetProgressTracking(): void {
    this.snapshotPreviousBody();
    this.stepDuration = 1 / this.movesPerSecond;
    this.lastStepAt = this.stepDuration;
  }

  /** Start a fresh run */
  startNew(mode: GameMode, levelId = 1, speed?: SpeedName): void {
    if (speed) this.speed = speed;
    this.mode = mode;
    this.levelId = mode === GAME_MODES.CLASSIC ? 0 : levelId;
    this.isBossFight = false;
    this.bossTier = 0;
    this.score = 0;
    this.alive = true;
    this.levelComplete = false;
    this.finalVictory = false;
    this.gameOverReason = '';
    this.waitingToStart = true;
    this.acc = 0;
    this.tick = 0;
    this.loadLevelData();
    this.spawnNormalFood();
    this.persist();
  }

  /** Start a boss arena after level 5, 10, or 15. */
  startBossFight(tier: number): void {
    this.mode = GAME_MODES.LEVEL_BASED;
    this.isBossFight = true;
    this.bossTier = tier;
    this.score = 0;
    this.alive = true;
    this.levelComplete = false;
    this.finalVictory = false;
    this.gameOverReason = '';
    this.waitingToStart = true;
    this.acc = 0;
    this.tick = 0;
    this.loadLevelData();
    this.spawnNormalFood();
    this.persist();
  }

  /** Continue from save */
  continueFromSave(): boolean {
    const save = loadSave();
    if (!save) return false;
    this.mode = save.mode;
    this.levelId = save.levelId;
    this.isBossFight = save.isBossFight === true;
    this.bossTier = save.bossTier ?? 0;
    this.speed = save.speed;
    this.score = save.score;
    this.alive = true;
    this.levelComplete = false;
    this.finalVictory = false;
    this.gameOverReason = '';
    this.waitingToStart = true;
    this.acc = 0;
    this.loadLevelData();
    this.dragon = {
      body: save.dragonBody.map((p) => ({ ...p })),
      direction: save.direction,
      pendingDirection: null,
      growPending: 0,
    };
    this.food = {
      position: save.foodPosition ? { ...save.foodPosition } : null,
      isFinal: save.isFinalFood,
    };
    this.resetProgressTracking();
    this.finalFoodSpawned = save.finalFoodSpawned;
    this.foodsEaten = save.foodsEaten;
    this.foodLimit =
      this.mode === GAME_MODES.CLASSIC ? 0 : clampFoodLimit(save.foodLimit);
    if (this.isBossFight && save.warriorPosition) {
      this.warrior = { position: { ...save.warriorPosition }, moveCooldown: 0 };
      this.warriorPrev = { ...save.warriorPosition };
      this.warriorCameFrom = null;
    }
    if (!this.food.position) this.spawnNormalFood();
    this.refreshOccupied();
    return true;
  }

  private loadLevelData(): void {
    if (this.mode === GAME_MODES.CLASSIC) {
      this.level = getClassicLevel();
      this.walls = new Set();
      this.openings = new Map();
      this.playableArea = GRID_WIDTH * GRID_HEIGHT;
      this.requiredLength = 0;
      this.foodLimit = 0; // classic is endless — no final food
    } else if (this.isBossFight) {
      this.level = getBossLevel(this.bossTier);
      const { playableArea, wallSet } = computePlayableArea(this.level);
      this.walls = wallSet;
      this.playableArea = playableArea;
      this.openings = buildOpeningMap(this.level);
      const raw = loadSettings().foodLimit;
      const maxByArena = Math.max(5, playableArea - this.level.startingDragon.length - 2);
      // Boss challenge target: one-third more foods than the selected target.
      this.foodLimit = Math.min(clampFoodLimit(Math.ceil(raw * 4 / 3)), maxByArena);
    } else {
      this.level = getLevel(this.levelId);
      const { playableArea, wallSet } = computePlayableArea(this.level);
      this.walls = wallSet;
      this.playableArea = playableArea;
      this.openings = buildOpeningMap(this.level);
      // Food limit from settings, clamped so the arena stays coverable
      const raw = loadSettings().foodLimit;
      const maxByArena = Math.max(5, playableArea - this.level.startingDragon.length - 2);
      this.foodLimit = Math.min(clampFoodLimit(raw), maxByArena);
    }
    this.dragon = createDragon(this.level);
    this.resetProgressTracking();
    this.food = { position: null, isFinal: false };
    this.bossWarriorVulnerable = false;
    this.bonusFood = { position: null, timeLeft: 0, maxTime: 0 };
    this.warrior = { position: null, moveCooldown: 0 };
    this.warriorPrev = null;
    this.warriorCameFrom = null;
    this.warriorPhase = 0;
    this.finalFoodSpawned = false;
    this.foodsEaten = 0;
    this.requiredLength = this.dragon.body.length + this.foodLimit;
    this.refreshOccupied();
    if (this.isBossFight) this.spawnWarrior();
    const hsKey = this.highScoreKey();
    this.highScore = loadSettings().highScores[hsKey] ?? 0;
  }

  private highScoreKey(): string {
    if (this.mode === GAME_MODES.CLASSIC) return 'classic';
    if (this.isBossFight) return `boss_${this.bossTier}`;
    if (this.mode === GAME_MODES.CONSTANT) return `constant_${this.levelId}`;
    return `levelbased_${this.levelId}`;
  }

  private directionFromVector(dx: number, dy: number): DirectionName {
    if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'RIGHT' : 'LEFT';
    return dy >= 0 ? 'DOWN' : 'UP';
  }

  private refreshOccupied(): void {
    this.occupiedCache.clear();
    for (const s of this.dragon.body) this.occupiedCache.add(keyOf(s));
  }

  private spawnNormalFood(): void {
    this.refreshOccupied();
    if (this.bonusFood.position) this.occupiedCache.add(keyOf(this.bonusFood.position));
    // Never spawn food under the boss warrior — grabbing it would force a
    // lethal head-dash, which made boss food placement feel inconsistent.
    if (this.warrior.position) {
      this.occupiedCache.add(keyOf(this.warrior.position));
      // Also avoid his 4 adjacent cells so fruit is always safely reachable.
      for (const d of Object.values(DIRECTIONS)) {
        this.occupiedCache.add(
          keyOf({ x: this.warrior.position.x + d.x, y: this.warrior.position.y + d.y })
        );
      }
    }
    const p = randomEmptyCell(this.walls, this.occupiedCache, GRID_WIDTH, GRID_HEIGHT);
    this.food = { position: p, isFinal: false };
  }

  private spawnFinalFood(): void {
    this.refreshOccupied();
    if (this.warrior.position) this.occupiedCache.add(keyOf(this.warrior.position));
    const p = randomEmptyCell(this.walls, this.occupiedCache, GRID_WIDTH, GRID_HEIGHT);
    this.food = { position: p, isFinal: true };
    this.finalFoodSpawned = true;
  }

  /**
   * Constant mode: spawn the timed 5-point fruit somewhere that is NOT the
   * normal fruit's cell, so both are visible at once and the player has to
   * decide which one to chase before the timer runs out.
   */
  private spawnBonusFood(): void {
    this.refreshOccupied();
    if (this.food.position) this.occupiedCache.add(keyOf(this.food.position));
    const p = randomEmptyCell(this.walls, this.occupiedCache, GRID_WIDTH, GRID_HEIGHT);
    if (!p) return;
    this.bonusFood = {
      position: p,
      timeLeft: BONUS_DURATION,
      maxTime: BONUS_DURATION,
    };
  }

  private clearBonusFood(): void {
    this.bonusFood = { position: null, timeLeft: 0, maxTime: 0 };
  }

  /** 0..1 remaining fraction of the bonus timer (for the countdown ring) */
  get bonusProgress(): number {
    if (!this.bonusFood.position || this.bonusFood.maxTime <= 0) return 0;
    return Math.max(0, Math.min(1, this.bonusFood.timeLeft / this.bonusFood.maxTime));
  }

  private spawnWarrior(): void {
    this.refreshOccupied();
    if (this.food.position) this.occupiedCache.add(keyOf(this.food.position));
    // Spawn far from the dragon head so the fight starts readable.
    const head = this.dragon.body[0];
    const candidates: Vec2[] = [];
    for (let y = 1; y < GRID_HEIGHT - 1; y++) {
      for (let x = 1; x < GRID_WIDTH - 1; x++) {
        const p = { x, y };
        const k = keyOf(p);
        if (this.walls.has(k) || this.occupiedCache.has(k)) continue;
        if (Math.abs(x - head.x) + Math.abs(y - head.y) >= 9) candidates.push(p);
      }
    }
    this.warrior = {
      position: candidates[Math.floor(Math.random() * candidates.length)] ?? { x: 12, y: 3 },
      moveCooldown: 0,
    };
    this.warriorPrev = this.warrior.position ? { ...this.warrior.position } : null;
    this.warriorCameFrom = null;
  }

  private isBlockedForWarrior(p: Vec2): boolean {
    if (p.x < 0 || p.x >= GRID_WIDTH || p.y < 0 || p.y >= GRID_HEIGHT) return true;
    if (this.walls.has(keyOf(p))) return true;
    // The dragon body is a moving cage. The head is intentionally not
    // blocked for warrior pathing, so pre-growth he can truly dash into it.
    return this.dragon.body.slice(1).some((seg) => samePos(seg, p));
  }

  private warriorMovesFrom(origin: Vec2): Vec2[] {
    return Object.values(DIRECTIONS)
      .map((d) => ({ x: origin.x + d.x, y: origin.y + d.y }))
      .filter((p) => !this.isBlockedForWarrior(p));
  }

  private scoreWarriorHunt(p: Vec2, head: Vec2, predictedHead: Vec2): number {
    const dHead = Math.abs(p.x - head.x) + Math.abs(p.y - head.y);
    const dPred = Math.abs(p.x - predictedHead.x) + Math.abs(p.y - predictedHead.y);
    const mobility = this.warriorMovesFrom(p).length;
    return -dHead * 1.5 - dPred * 2.1 + mobility * 2.2;
  }

  private scoreWarriorEscape(p: Vec2, head: Vec2, predictedHead: Vec2): number {
    const dHead = Math.abs(p.x - head.x) + Math.abs(p.y - head.y);
    const dPred = Math.abs(p.x - predictedHead.x) + Math.abs(p.y - predictedHead.y);
    const mobility = this.warriorMovesFrom(p).length;
    return dHead * 1.3 + dPred * 2.2 + mobility * 2.6;
  }

  private updateWarrior(): EngineEvent {
    if (!this.isBossFight || !this.warrior.position) return { type: 'none' };

    // Default: no movement this step → renderer keeps him standing still.
    this.warriorPrev = { ...this.warrior.position };

    const allMoves = this.warriorMovesFrom(this.warrior.position);
    if (allMoves.length === 0) return this.completeBossFight();

    // Warrior speed is exactly 2/3 of the dragon's current logical speed:
    // two warrior moves for every three dragon moves.
    this.warriorPhase += 2;
    if (this.warriorPhase < 3) return { type: 'none' };
    this.warriorPhase -= 3;

    const head = this.dragon.body[0];
    const nextHeadDir = DIRECTIONS[this.dragon.pendingDirection ?? this.dragon.direction];
    const predictedHead = { x: head.x + nextHeadDir.x, y: head.y + nextHeadDir.y };

    const dragonIsBig = this.foodsEaten >= this.foodLimit;
    this.bossWarriorVulnerable = dragonIsBig;

    // Anti-jitter: never step straight back onto the cell he just left
    // unless it is the only option. This removes the unnatural
    // back-and-forth "vibrating" movement.
    let moves = allMoves;
    if (this.warriorCameFrom && allMoves.length > 1) {
      const cameFrom = this.warriorCameFrom;
      const filtered = allMoves.filter((p) => !samePos(p, cameFrom));
      if (filtered.length > 0) moves = filtered;
    }

    const scoreFn = dragonIsBig
      ? (p: Vec2) => this.scoreWarriorEscape(p, head, predictedHead)
      : (p: Vec2) => this.scoreWarriorHunt(p, head, predictedHead);

    // Mostly purposeful, slightly unpredictable: 80% best move,
    // 20% second-best (never a fully random flail).
    const ranked = [...moves].sort((a, b) => scoreFn(b) - scoreFn(a));
    let chosen =
      ranked.length > 1 && Math.random() < 0.2 ? ranked[1] : ranked[0];

    // Boss arenas inherit portal behavior: if the warrior steps onto a
    // connected opening and the destination is not blocked by the dragon,
    // he uses it immediately.
    const tele = this.openings.get(keyOf(chosen));
    if (tele && !this.isBlockedForWarrior(tele)) {
      this.warriorCameFrom = { ...chosen };
      chosen = tele;
      // Teleport: don't glide across the whole map — snap on arrival.
      this.warriorPrev = { ...chosen };
    } else {
      this.warriorCameFrom = { ...this.warrior.position };
    }

    this.warrior.position = chosen;

    // If the warrior becomes trapped after moving, boss is cleared.
    if (this.warriorMovesFrom(chosen).length === 0) return this.completeBossFight();
    return { type: 'none' };
  }

  setDirection(dir: DirectionName): void {
    if (!this.alive || this.levelComplete) return;
    // Prevent instant reverse into self
    if (OPPOSITE[dir] === this.dragon.direction) return;
    if (OPPOSITE[dir] === (this.dragon.pendingDirection ?? this.dragon.direction)) return;
    this.dragon.pendingDirection = dir;
    // Keypress begins the loop of dragon movement
    if (this.waitingToStart) {
      this.waitingToStart = false;
    }
  }

  /** Advance simulation by dt seconds. Returns event if something notable happened. */
  update(dt: number): EngineEvent {
    if (!this.alive || this.levelComplete || this.finalVictory) return { type: 'none' };
    if (this.waitingToStart) return { type: 'none' };

    this.beginFrame(dt);
    let pending: EngineEvent = { type: 'none' };

    // Tick the Constant-mode bonus fruit timer
    if (this.bonusFood.position) {
      this.bonusFood.timeLeft -= dt;
      if (this.bonusFood.timeLeft <= 0) {
        this.clearBonusFood();
        // Missed it — the streak resets, you must earn another chance
        this.foodsEaten = 0;
        pending = { type: 'bonus_expired' };
      }
    }

    this.acc += dt;
    const step = 1 / this.movesPerSecond;
    let event: EngineEvent = pending;

    while (this.acc >= step) {
      this.acc -= step;
      const e = this.step();
      if (e.type !== 'none') {
        event = e;
        break;
      }
    }
    return event;
  }

  private step(): EngineEvent {
    this.tick++;
    this.snapshotPreviousBody();
    this.stepDuration = 1 / this.movesPerSecond;
    this.lastStepAt = 0;

    if (this.dragon.pendingDirection) {
      if (OPPOSITE[this.dragon.pendingDirection] !== this.dragon.direction) {
        this.dragon.direction = this.dragon.pendingDirection;
      }
      this.dragon.pendingDirection = null;
    }

    const dir = DIRECTIONS[this.dragon.direction];
    const head = this.dragon.body[0];
    let nx = head.x + dir.x;
    let ny = head.y + dir.y;

    // Classic wrapping
    if (this.mode === GAME_MODES.CLASSIC) {
      if (nx < 0) nx = GRID_WIDTH - 1;
      if (nx >= GRID_WIDTH) nx = 0;
      if (ny < 0) ny = GRID_HEIGHT - 1;
      if (ny >= GRID_HEIGHT) ny = 0;
    } else {
      // If the current head cell is an opening portal source, moving "out" teleports
      const headPortal = this.openings.get(keyOf(head));
      const nextPortal = this.openings.get(keyOf([nx, ny]));

      // Entering a portal cell → teleport to its destination. In the
      // third five non-symmetric gap levels, movement continues outward
      // in the teleported exit direction rather than the last user command.
      if (nextPortal) {
        nx = nextPortal.x;
        ny = nextPortal.y;
        if (this.levelId >= 11) {
          this.dragon.direction = this.directionFromVector(dir.x, dir.y);
        }
      } else {
        const outOfBounds =
          nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT;

        if (outOfBounds) {
          // Leaving the map from a portal cell uses that portal's destination
          if (headPortal) {
            nx = headPortal.x;
            ny = headPortal.y;
            if (this.levelId >= 11) {
              this.dragon.direction = this.directionFromVector(dir.x, dir.y);
            }
          } else {
            return this.kill('Crashed into the void!');
          }
        }
      }
    }

    const newHead = { x: nx, y: ny };
    const newKey = keyOf(newHead);

    // Wall collision
    if (this.walls.has(newKey)) {
      return this.kill('Hit a wall!');
    }

    // Destination blocked check after portal
    if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) {
      return this.kill('Invalid portal destination!');
    }

    // Self collision — allow moving into tail if tail will move away
    const willGrow = this.dragon.growPending > 0;
    const bodyToCheck = willGrow
      ? this.dragon.body
      : this.dragon.body.slice(0, -1);
    for (const seg of bodyToCheck) {
      if (samePos(seg, newHead)) {
        return this.kill('Hit your own body!');
      }
    }

    // Move
    this.dragon.body.unshift(newHead);
    if (this.dragon.growPending > 0) {
      this.dragon.growPending--;
    } else {
      this.dragon.body.pop();
    }

    // Boss fight rule: before the dragon is big enough, the warrior hunts the head.
    // Once the food target is eaten, the warrior becomes the final fruit and flees.
    if (this.isBossFight && this.warrior.position) {
      if (!this.bossWarriorVulnerable && samePos(newHead, this.warrior.position)) {
        return this.kill('You dashed into the warrior while still too small!');
      }
      if (this.bossWarriorVulnerable && samePos(newHead, this.warrior.position)) {
        return this.completeBossFight();
      }
      const bossEvent = this.updateWarrior();
      if (bossEvent.type !== 'none') return bossEvent;
      if (this.bossWarriorVulnerable && this.warrior.position && samePos(this.dragon.body[0], this.warrior.position)) {
        return this.completeBossFight();
      }
      if (!this.bossWarriorVulnerable && this.warrior.position && samePos(this.dragon.body[0], this.warrior.position)) {
        return this.kill('The warrior intercepted your dragon head!');
      }
    }

    // ── Timed bonus fruit (Constant mode) — worth 5, no growth ──
    if (this.bonusFood.position && samePos(newHead, this.bonusFood.position)) {
      const points = this.level.food.finalPoints;
      this.score += points;
      this.clearBonusFood();
      // Streak resets so a new bonus must be earned
      this.foodsEaten = 0;
      this.highScore = updateHighScore(this.highScoreKey(), this.score);
      this.persist();
      return { type: 'ate_food', points, isFinal: true };
    }

    // ── Normal / final food ──
    if (this.food.position && samePos(newHead, this.food.position)) {
      const isFinal = this.food.isFinal;
      const points = isFinal
        ? this.level.food.finalPoints
        : this.level.food.normalPoints;

      this.score += points;

      if (isFinal) {
        if (this.isBossFight) {
          this.food = { position: null, isFinal: false };
          this.spawnNormalFood();
          return { type: 'ate_food', points, isFinal: true };
        }
        this.food = { position: null, isFinal: false };
        return this.completeLevel();
      }

      // Normal food: +1 segment
      this.dragon.growPending += this.level.food.growth;
      this.food = { position: null, isFinal: false };
      this.foodsEaten++;

      let spawnedBonus = false;

      if (this.isBossFight) {
        if (this.foodsEaten >= this.foodLimit) {
          // Target reached — the warrior IS the final fruit now. Stop
          // spawning normal fruit so the objective is unmistakable.
          this.bossWarriorVulnerable = true;
          this.food = { position: null, isFinal: false };
        } else {
          this.spawnNormalFood();
        }
      } else if (this.mode === GAME_MODES.CONSTANT) {
        // Endless mode: normal food ALWAYS respawns. Once the streak target
        // is hit, the timed 5-point fruit spawns alongside it so both are
        // on the board at the same time.
        this.spawnNormalFood();
        if (!this.bonusFood.position && this.foodsEaten >= this.foodLimit) {
          this.spawnBonusFood();
          spawnedBonus = this.bonusFood.position !== null;
        }
      } else if (
        this.mode !== GAME_MODES.CLASSIC &&
        !this.finalFoodSpawned &&
        this.foodsEaten >= this.foodLimit
      ) {
        // Level Based: final food replaces normal food and ends the level
        this.spawnFinalFood();
      } else {
        this.spawnNormalFood();
      }

      this.persist();
      if (spawnedBonus) return { type: 'bonus_spawned' };
      return { type: 'ate_food', points, isFinal: false };
    }

    // Periodic autosave
    if (this.tick % 20 === 0) this.persist();

    return { type: 'none' };
  }

  private kill(reason: string): EngineEvent {
    this.alive = false;
    this.gameOverReason = reason;
    this.highScore = updateHighScore(this.highScoreKey(), this.score);
    clearSave();
    return { type: 'game_over', reason };
  }

  private completeLevel(): EngineEvent {
    this.highScore = updateHighScore(this.highScoreKey(), this.score);

    if (this.mode === GAME_MODES.LEVEL_BASED) {
      this.levelComplete = true;
      return { type: 'level_complete', score: this.score };
    }

    // Constant/Endless mode: Keep the dragon's current body size. Spawns new food.
    if (this.mode === GAME_MODES.CONSTANT) {
      this.levelComplete = false;
      this.finalFoodSpawned = false;
      this.foodsEaten = 0;
      this.requiredLength = this.dragon.body.length + this.foodLimit;
      this.spawnNormalFood();
      this.persist();
      return { type: 'ate_food', points: this.level.food.finalPoints, isFinal: true };
    }

    this.levelComplete = true;
    clearSave();
    return { type: 'level_complete', score: this.score };
  }

  private completeBossFight(): EngineEvent {
    this.levelComplete = true;
    this.highScore = updateHighScore(this.highScoreKey(), this.score);
    // Keep the warrior visible during the delayed completion pause so the
    // player can see exactly how they trapped him.
    return { type: 'boss_trapped', tier: this.bossTier };
  }

  /** Advance to next level after level-complete screen */
  advanceLevel(): void {
    if (this.mode !== GAME_MODES.LEVEL_BASED) return;
    if (this.isBossFight) {
      if (this.bossTier >= 3) {
        this.finalVictory = true;
        clearSave();
        return;
      }
      this.isBossFight = false;
      this.bossTier = 0;
      this.levelId = Math.min(MAX_LEVEL, this.levelId + 1);
    } else if (this.levelId % 5 === 0) {
      this.startBossFight(Math.ceil(this.levelId / 5));
      return;
    } else {
      this.levelId = Math.min(MAX_LEVEL, this.levelId + 1);
    }
    this.alive = true;
    this.levelComplete = false;
    this.finalVictory = false;
    this.gameOverReason = '';
    this.waitingToStart = true;
    this.acc = 0;
    this.tick = 0;
    this.loadLevelData();
    if (!this.isBossFight) this.spawnNormalFood();
    this.persist();
  }

  /** Restart current level (score reset optional) */
  restartLevel(resetScore = true): void {
    if (resetScore) this.score = 0;
    this.alive = true;
    this.levelComplete = false;
    this.finalVictory = false;
    this.gameOverReason = '';
    this.waitingToStart = true;
    this.acc = 0;
    this.tick = 0;
    this.loadLevelData();
    if (!this.isBossFight) this.spawnNormalFood();
    this.persist();
  }

  persist(): void {
    if (!this.alive || this.finalVictory) return;
    writeSave({
      mode: this.mode,
      levelId: this.levelId,
      score: this.score,
      speed: this.speed,
      dragonBody: this.dragon.body.map((p) => ({ ...p })),
      direction: this.dragon.direction,
      foodPosition: this.food.position ? { ...this.food.position } : null,
      isFinalFood: this.food.isFinal,
      finalFoodSpawned: this.finalFoodSpawned,
      foodsEaten: this.foodsEaten,
      foodLimit: this.foodLimit,
      isBossFight: this.isBossFight,
      bossTier: this.bossTier,
      warriorPosition: this.warrior.position ? { ...this.warrior.position } : null,
    });
  }

  snapshot(): RuntimeGameData {
    return {
      mode: this.mode,
      levelId: this.levelId,
      score: this.score,
      speed: this.speed,
      dragon: {
        body: this.dragon.body.map((p) => ({ ...p })),
        direction: this.dragon.direction,
        pendingDirection: this.dragon.pendingDirection,
        growPending: this.dragon.growPending,
      },
      food: {
        position: this.food.position ? { ...this.food.position } : null,
        isFinal: this.food.isFinal,
      },
      finalFoodSpawned: this.finalFoodSpawned,
      requiredLength: this.requiredLength,
      playableArea: this.playableArea,
      walls: this.walls,
      openings: this.openings,
      tick: this.tick,
      highScore: this.highScore,
      isBossFight: this.isBossFight,
      bossTier: this.bossTier,
      warrior: {
        position: this.warrior.position ? { ...this.warrior.position } : null,
        moveCooldown: this.warrior.moveCooldown,
      },
    };
  }
}
