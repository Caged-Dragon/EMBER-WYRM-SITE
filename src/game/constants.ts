// Core grid and screen constants for Top-View Dragon Arena
export const GRID_WIDTH = 24;
export const GRID_HEIGHT = 18;
export const CELL_SIZE = 40;
export const SCREEN_WIDTH = GRID_WIDTH * CELL_SIZE; // 960
export const SCREEN_HEIGHT = GRID_HEIGHT * CELL_SIZE; // 720

export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
} as const;

export type DirectionName = keyof typeof DIRECTIONS;
export type Vec2 = { x: number; y: number };

export const OPPOSITE: Record<DirectionName, DirectionName> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

export const SPEEDS = {
  Beginner: 4,
  Low: 6,
  Mid: 8,
  High: 11,
  Extreme: 15,
} as const;

export type SpeedName = keyof typeof SPEEDS;

export const SPEED_LABELS: SpeedName[] = ['Beginner', 'Low', 'Mid', 'High', 'Extreme'];

export const GAME_MODES = {
  CLASSIC: 'classic',
  LEVEL_BASED: 'level_based',
  CONSTANT: 'constant',
} as const;

export type GameMode = (typeof GAME_MODES)[keyof typeof GAME_MODES];

export type GameState =
  | 'MAIN_MENU'
  | 'MODE_SELECT'
  | 'LEVEL_SELECT'
  | 'SPEED_MENU'
  | 'GAMEPLAY'
  | 'PAUSED'
  | 'GAME_OVER'
  | 'LEVEL_COMPLETE'
  | 'FINAL_VICTORY';

export const SAVE_KEY = 'dragon_arena_save';
export const SETTINGS_KEY = 'dragon_arena_settings';
export const MAX_LEVEL = 15;

/** Food limit: how many normal foods spawn the Final Food */
export const FOOD_DEFAULT = 20;
export const FOOD_MIN = 5;
export const FOOD_MAX = 400;

/**
 * Constant (endless) mode only: the 5-point special fruit appears
 * ALONGSIDE the normal 1-point fruit and expires after this many
 * seconds, forcing a risk/reward decision.
 */
export const BONUS_DURATION = 8;

/** Light / dark presentation mode */
export type UITheme = 'dark' | 'light';

export const COMPLETION_PERCENTAGES: Record<number, number> = {
  1: 0.6,
  2: 0.62,
  3: 0.64,
  4: 0.66,
  5: 0.68,
  6: 0.7,
  7: 0.72,
  8: 0.75,
  9: 0.77,
  10: 0.8,
  11: 0.72,
  12: 0.74,
  13: 0.76,
  14: 0.78,
  15: 0.8,
};
