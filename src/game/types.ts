import type { DirectionName, GameMode, SpeedName, Vec2 } from './constants';

export interface LevelData {
  levelId: number;
  name: string;
  theme: string;
  grid: { width: number; height: number };
  startingDragon: {
    position: [number, number];
    direction: DirectionName;
    length: number;
  };
  completion: { percentage: number };
  walls: [number, number][];
  openings: [number, number][];
  connections: { from: [number, number]; to: [number, number] }[];
  food: {
    normalPoints: number;
    growth: number;
    finalPoints: number;
  };
  environment: {
    background: string;
    wallStyle: string;
    colors: ThemeColors;
  };
}

export interface ThemeColors {
  bg1: string;
  bg2: string;
  bg3: string;
  wall: string;
  wallEdge: string;
  wallHighlight: string;
  accent: string;
  food: string;
  foodGlow: string;
  decor: string;
  particle: string;
}

export interface DragonState {
  body: Vec2[];
  direction: DirectionName;
  pendingDirection: DirectionName | null;
  growPending: number;
}

export interface FoodState {
  position: Vec2 | null;
  isFinal: boolean;
}

export interface RuntimeGameData {
  mode: GameMode;
  levelId: number;
  score: number;
  speed: SpeedName;
  dragon: DragonState;
  food: FoodState;
  finalFoodSpawned: boolean;
  requiredLength: number;
  playableArea: number;
  walls: Set<string>;
  openings: Map<string, Vec2>;
  tick: number;
  highScore: number;
  isBossFight?: boolean;
  bossTier?: number;
  warrior?: WarriorState;
}

export interface SaveData {
  version: number;
  mode: GameMode;
  levelId: number;
  score: number;
  speed: SpeedName;
  dragonBody: Vec2[];
  direction: DirectionName;
  foodPosition: Vec2 | null;
  isFinalFood: boolean;
  finalFoodSpawned: boolean;
  foodsEaten: number;
  foodLimit: number;
  isBossFight?: boolean;
  bossTier?: number;
  warriorPosition?: Vec2 | null;
  timestamp: number;
}

export interface SettingsData {
  speed: SpeedName;
  highScores: Record<string, number>;
  foodLimit: number;
  uiTheme: 'dark' | 'light';
}

/** Timed 5-point fruit that coexists with normal food in Constant mode */
export interface BonusFoodState {
  position: Vec2 | null;
  timeLeft: number;
  maxTime: number;
}

export interface WarriorState {
  position: Vec2 | null;
  moveCooldown: number;
}
