import { supabase } from './client';
import { SCORE_DIRECTION } from './config';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The database rate-limits one score per game every 3s, so queue per game. */
const chains = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev.then(fn);
  chains.set(key, run.then(() => sleep(3200), () => sleep(3200)));
  return run;
}

/* ------------------------------------------------------------------ */
/* scores                                                              */
/* ------------------------------------------------------------------ */

export interface RunResult {
  is_best: boolean;
  best: number | null;
  xp_gained: number;
}

type PendingRuns = Record<string, { score: number; meta?: Record<string, unknown> }>;
const PENDING_KEY = 'dps-pending-runs';

function readPending(): PendingRuns {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}') as PendingRuns;
  } catch {
    return {};
  }
}
function writePending(p: PendingRuns) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

function isBetter(game: string, a: number, b: number) {
  return (SCORE_DIRECTION[game] ?? 'high') === 'high' ? a > b : a < b;
}

/**
 * Report a finished run. Signed in → posted to the shared leaderboard.
 * Guest → the best run per game is remembered and posted automatically after login.
 */
export async function reportRun(
  game: string,
  score: number,
  meta?: Record<string, unknown>,
): Promise<RunResult | null> {
  if (!Number.isFinite(score) || score < 0) return null;
  const uid = await currentUserId();
  if (!uid) {
    const pending = readPending();
    const cur = pending[game];
    if (!cur || isBetter(game, score, cur.score)) {
      pending[game] = { score, meta };
      writePending(pending);
    }
    return null;
  }
  return serial(game, async () => {
    const { data, error } = await supabase.rpc('submit_score', {
      p_game: game,
      p_score: score,
      p_meta: meta ?? {},
    });
    if (error) {
      console.warn('[dps] score not recorded:', error.message);
      return null;
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('dps:xp'));
    return data as RunResult;
  });
}

/** Post any scores earned while signed out. */
export async function flushPendingRuns(): Promise<void> {
  const pending = readPending();
  const games = Object.keys(pending);
  if (!games.length) return;
  writePending({});
  await Promise.all(games.map((g) => reportRun(g, pending[g].score, pending[g].meta)));
}

/** Marks a game as recently played (works for games without scores too). */
export async function touchGame(game: string): Promise<void> {
  if (!(await currentUserId())) return;
  const { error } = await supabase.rpc('touch_game', { p_game: game });
  if (error) console.warn('[dps] touch_game:', error.message);
}

export interface MyGameStat {
  game_slug: string;
  best_score: number | null;
  last_score: number | null;
  plays: number;
  best_at: string | null;
  last_played_at: string;
}

export async function getMyStats(): Promise<MyGameStat[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('game_stats')
    .select('game_slug,best_score,last_score,plays,best_at,last_played_at')
    .eq('user_id', uid)
    .order('last_played_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as MyGameStat[];
}

export interface LeaderRow {
  rank: number;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar: string;
  best_score: number;
  plays: number;
}

export async function getLeaderboard(game: string, limit = 25): Promise<LeaderRow[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('rank,user_id,username,display_name,avatar,best_score,plays')
    .eq('game_slug', game)
    .order('rank', { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as LeaderRow[];
}

export interface TopPlayer {
  id: string;
  username: string;
  display_name: string | null;
  avatar: string;
  xp: number;
}

export async function getTopPlayers(limit = 25): Promise<TopPlayer[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,display_name,avatar,xp')
    .order('xp', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as TopPlayer[];
}

/* ------------------------------------------------------------------ */
/* cloud saves                                                         */
/* ------------------------------------------------------------------ */

export interface CloudSave<T> {
  data: T;
  version: number;
  updatedAt: number;
}

export async function loadCloudSave<T>(game: string, slot = 'main'): Promise<CloudSave<T> | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('game_saves')
    .select('data,version,updated_at')
    .eq('user_id', uid)
    .eq('game_slug', game)
    .eq('slot', slot)
    .maybeSingle();
  if (error || !data) return null;
  return { data: data.data as T, version: data.version as number, updatedAt: Date.parse(data.updated_at as string) };
}

export async function writeCloudSave(game: string, slot: string, data: unknown, version = 1): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const { error } = await supabase
    .from('game_saves')
    .upsert({ user_id: uid, game_slug: game, slot, version, data }, { onConflict: 'user_id,game_slug,slot' });
  if (error) console.warn('[dps] cloud save failed:', error.message);
}

export async function deleteCloudSave(game: string, slot = 'main'): Promise<void> {
  cancelQueued(game, slot);
  const uid = await currentUserId();
  if (!uid) return;
  await supabase.from('game_saves').delete().eq('user_id', uid).eq('game_slug', game).eq('slot', slot);
}

type Queued = { game: string; slot: string; data: unknown; version: number };
const queued = new Map<string, Queued>();
let queueTimer: ReturnType<typeof setTimeout> | null = null;

function cancelQueued(game: string, slot: string) {
  queued.delete(`${game}:${slot}`);
}

/** Debounced save for frequently-changing data (autosaves). Flushed on tab hide. */
export function queueCloudSave(game: string, slot: string, data: unknown, version = 1, delayMs = 5000): void {
  queued.set(`${game}:${slot}`, { game, slot, data, version });
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = setTimeout(() => void flushCloudSaves(), delayMs);
}

export async function flushCloudSaves(): Promise<void> {
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  const items = [...queued.values()];
  queued.clear();
  await Promise.all(items.map((q) => writeCloudSave(q.game, q.slot, q.data, q.version)));
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushCloudSaves();
  });
  window.addEventListener('pagehide', () => void flushCloudSaves());
}

/* ------------------------------------------------------------------ */
/* favorites + profile                                                 */
/* ------------------------------------------------------------------ */

export async function listFavorites(): Promise<string[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('favorites')
    .select('game_slug')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => r.game_slug as string);
}

export async function addFavorite(game: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const { error } = await supabase.from('favorites').insert({ user_id: uid, game_slug: game });
  if (error && error.code !== '23505') console.warn('[dps] favorite:', error.message);
}

export async function removeFavorite(game: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  await supabase.from('favorites').delete().eq('user_id', uid).eq('game_slug', game);
}

export async function updateProfile(patch: {
  username?: string;
  display_name?: string | null;
  avatar?: string;
}): Promise<string | null> {
  const uid = await currentUserId();
  if (!uid) return 'Please sign in first.';
  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  if (!error) return null;
  if (error.code === '23505') return 'That username is already taken.';
  if (error.code === '23514') return 'Usernames are 3–20 letters, numbers or underscores.';
  return error.message;
}

export async function isUsernameTaken(name: string): Promise<boolean> {
  const escaped = name.replace(/[\\%_]/g, '\\$&');
  const { data } = await supabase.from('profiles').select('id').ilike('username', escaped).limit(1);
  return (data ?? []).length > 0;
}
