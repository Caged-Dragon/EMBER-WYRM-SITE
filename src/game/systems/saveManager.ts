import {
  FOOD_DEFAULT,
  FOOD_MAX,
  FOOD_MIN,
  SAVE_KEY,
  SETTINGS_KEY,
  type SpeedName,
} from '../constants';
import type { SaveData, SettingsData } from '../types';

// Bumped to 5: fixed crashing portal-gap mismatches on Levels 12-15 and Level 10
const SAVE_VERSION = 5;

export function clampFoodLimit(n: number): number {
  if (!Number.isFinite(n)) return FOOD_DEFAULT;
  return Math.round(Math.max(FOOD_MIN, Math.min(FOOD_MAX, n)));
}

const defaultSettings = (): SettingsData => ({
  speed: 'Mid',
  highScores: {},
  foodLimit: FOOD_DEFAULT,
  uiTheme: 'dark',
});

export function loadSettings(): SettingsData {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const data = JSON.parse(raw) as SettingsData;
    if (!data.speed) data.speed = 'Mid';
    if (!data.highScores) data.highScores = {};
    if (typeof data.foodLimit !== 'number') data.foodLimit = FOOD_DEFAULT;
    data.foodLimit = clampFoodLimit(data.foodLimit);
    if (data.uiTheme !== 'light' && data.uiTheme !== 'dark') data.uiTheme = 'dark';
    return data;
  } catch {
    return defaultSettings();
  }
}

export function setUIThemeSetting(theme: 'dark' | 'light'): void {
  const s = loadSettings();
  s.uiTheme = theme;
  saveSettings(s);
}

export function saveSettings(settings: SettingsData): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage may be unavailable
  }
}

export function setSpeedSetting(speed: SpeedName): void {
  const s = loadSettings();
  s.speed = speed;
  saveSettings(s);
}

export function setFoodLimitSetting(limit: number): void {
  const s = loadSettings();
  s.foodLimit = clampFoodLimit(limit);
  saveSettings(s);
}

export function updateHighScore(key: string, score: number): number {
  const s = loadSettings();
  const prev = s.highScores[key] ?? 0;
  if (score > prev) {
    s.highScores[key] = score;
    saveSettings(s);
    return score;
  }
  return prev;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data || data.version !== SAVE_VERSION) return null;
    if (!Array.isArray(data.dragonBody) || data.dragonBody.length < 2) return null;
    if (!data.direction || !data.mode) return null;
    // Tolerate older saves missing food fields (no clamp here — classic stores 0)
    if (typeof data.foodLimit !== 'number') data.foodLimit = FOOD_DEFAULT;
    if (typeof data.foodsEaten !== 'number') data.foodsEaten = 0;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data: Omit<SaveData, 'version' | 'timestamp'>): void {
  try {
    const full: SaveData = {
      ...data,
      version: SAVE_VERSION,
      timestamp: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(full));
  } catch {
    // ignore
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export function hasSave(): boolean {
  return loadSave() !== null;
}
