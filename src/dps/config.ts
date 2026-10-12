// Dragon Pyre ecosystem configuration — the ONE place to update when a site's URL changes.
// The publishable key is designed to be public (data is protected by Row Level Security).

export const SUPABASE_URL = 'https://nllaznaojehldvgmarkf.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hymZ-smxjULVjj4mg7mp6w_KyIUE4zn';

export const HUB_URL = 'https://draco-pyre-strike.vercel.app';

export interface EcoSite {
  slug: string;
  title: string;
  tagline: string;
  url: string;
  emoji: string;
}

/** Standalone game sites that live outside the hub. */
export const ECOSYSTEM_SITES: EcoSite[] = [
  { slug: 'ember-wyrm', title: 'Ember Wyrm', tagline: 'Ten lairs, one hungry wyrm', url: 'https://emberwyrmsite.vercel.app', emoji: '🐍' },
  { slug: 'drakebreaker', title: 'Drakebreaker', tagline: '50 levels of brick-shattering fury', url: 'https://dragonbreaker-site.vercel.app', emoji: '🧱' },
  { slug: 'dragon-flight', title: 'Dragon Flight', tagline: 'Glide the gates, chase the sky', url: 'https://dragon-flight-site.vercel.app', emoji: '🪽' },
];

/** Which direction is "better" for each game's score. Mirrors the `games` table. */
export const SCORE_DIRECTION: Record<string, 'high' | 'low'> = {
  'dragon-strike': 'high',
  'ember-wyrm': 'high',
  'dragons-hoard': 'high',
  'drakebreaker': 'high',
  'dragon-flight': 'high',
  'dragons-lair': 'low',
  'dragons-memory': 'low',
  'dragons-riddle': 'low',
};

export const AVATARS: Record<string, string> = {
  ember: '🔥',
  frost: '❄️',
  storm: '⚡',
  void: '🌑',
  gold: '🪙',
  wyrm: '🐉',
};

export function avatarEmoji(id: string | null | undefined): string {
  return (id && AVATARS[id]) || AVATARS.ember;
}

/** Account level from cross-game XP. */
export function levelFromXp(xp: number): { level: number; into: number; needed: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1;
  const floor = 40 * (level - 1) * (level - 1);
  const next = 40 * level * level;
  return { level, into: xp - floor, needed: next - floor };
}
