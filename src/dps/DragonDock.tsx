import { useEffect, useRef, useState } from 'react';
import { useAuth } from './context';
import { ECOSYSTEM_SITES, HUB_URL, avatarEmoji, levelFromXp } from './config';

export type DockPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

/**
 * Floating account + "Realm map" button shown on every standalone game.
 * `siteSlug` is the current game's slug so it is highlighted in the list.
 */
export function DragonDock({ siteSlug, position = 'bottom-left' }: { siteSlug: string; position?: DockPosition }) {
  const { user, profile, loading, openAuth, signOut, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void refreshProfile();
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, refreshProfile]);

  // Keep keyboard events inside the panel from reaching the game.
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.type === 'keydown' && e.key === 'Escape') setOpen(false);
    };
    el.addEventListener('keydown', onKey);
    el.addEventListener('keyup', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('keyup', onKey);
    };
  }, [open]);

  const lvl = levelFromXp(profile?.xp ?? 0);
  const name = profile?.display_name || profile?.username || user?.email?.split('@')[0] || 'Player';

  return (
    <div ref={ref} className={`dps-dock dps-${position}`}>
      <button
        type="button"
        className="dps-fab"
        aria-label={user ? `Account and Realm map — ${name}` : 'Sign in and Realm map'}
        aria-expanded={open}
        onClick={(e) => {
          setOpen((o) => !o);
          if (e.detail !== 0) e.currentTarget.blur(); // don't let Space re-trigger it mid-game
        }}
      >
        <span aria-hidden>{user ? avatarEmoji(profile?.avatar) : '🐉'}</span>
        {!user && !loading && <i className="dps-dot" aria-hidden />}
      </button>

      {open && (
        <div className="dps-panel" role="menu">
          {user ? (
            <div className="dps-who">
              <span className="dps-av" aria-hidden>{avatarEmoji(profile?.avatar)}</span>
              <div>
                <strong>{name}</strong>
                <small>Level {lvl.level} · {profile?.xp ?? 0} XP</small>
                <div className="dps-bar"><b style={{ width: `${Math.min(100, (lvl.into / lvl.needed) * 100)}%` }} /></div>
              </div>
            </div>
          ) : (
            <div className="dps-guest">
              <strong>Playing as guest</strong>
              <small>Sign in to keep scores, saves and favorites across every game.</small>
              <button type="button" className="dps-primary" onClick={() => { setOpen(false); openAuth('signin'); }}>
                Sign in / Create account
              </button>
            </div>
          )}

          <p className="dps-h">Dragon Realm</p>
          <a className="dps-row" href={HUB_URL}>
            <span aria-hidden>🏰</span>
            <span><b>DracoPyre Strike</b><small>The hub — 10 games, leaderboards</small></span>
          </a>
          {ECOSYSTEM_SITES.map((s) =>
            s.slug === siteSlug ? (
              <div key={s.slug} className="dps-row dps-here" aria-current="page">
                <span aria-hidden>{s.emoji}</span>
                <span><b>{s.title}</b><small>You are here</small></span>
              </div>
            ) : (
              <a key={s.slug} className="dps-row" href={s.url}>
                <span aria-hidden>{s.emoji}</span>
                <span><b>{s.title}</b><small>{s.tagline}</small></span>
              </a>
            ),
          )}

          <div className="dps-foot">
            <a href={`${HUB_URL}/leaderboard`}>Leaderboards</a>
            {user && <a href={`${HUB_URL}/profile`}>My profile</a>}
            {user && (
              <button type="button" onClick={() => { setOpen(false); void signOut(); }}>Sign out</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
