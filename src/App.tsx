import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import {
  LightModeProvider,
  MenuButton,
  MenuShell,
  ThemeToggle,
  useLightMode,
} from './components/MenuShell';
import { SFX } from './game/audio';
import {
  FOOD_DEFAULT,
  FOOD_MAX,
  FOOD_MIN,
  GAME_MODES,
  SPEED_LABELS,
  type GameMode,
  type GameState,
  type SpeedName,
} from './game/constants';
import { GameEngine, type EngineEvent } from './game/engine';
import { LEVEL_META } from './game/levels/themes';
import {
  clampFoodLimit,
  hasSave,
  loadSettings,
  setFoodLimitSetting,
  setSpeedSetting,
  setUIThemeSetting,
  syncFromCloud,
} from './game/systems/saveManager';
import { DragonDock, exitToHub, useAuth } from './dps';

export default function App() {
  const [isLight, setIsLight] = useState<boolean>(
    () => loadSettings().uiTheme === 'light'
  );

  const toggleTheme = useCallback(() => {
    setIsLight((prev) => {
      const next = !prev;
      setUIThemeSetting(next ? 'light' : 'dark');
      SFX.select();
      return next;
    });
  }, []);

  return (
    <LightModeProvider isLight={isLight}>
      <GameApp isLight={isLight} onToggleTheme={toggleTheme} />
      <DragonDock siteSlug="ember-wyrm" position="bottom-left" />
    </LightModeProvider>
  );
}

interface GameAppProps {
  isLight: boolean;
  onToggleTheme: () => void;
}

function GameApp({ isLight, onToggleTheme }: GameAppProps) {
  const engine = useMemo(() => new GameEngine(), []);
  const [screen, setScreen] = useState<GameState | 'FOOD_LIMIT_POPUP'>('MAIN_MENU');
  const [speed, setSpeed] = useState<SpeedName>(() => loadSettings().speed);
  const [foodLimit, setFoodLimit] = useState<number>(() => loadSettings().foodLimit);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [pendingMode, setPendingMode] = useState<GameMode>(GAME_MODES.LEVEL_BASED);
  const [message, setMessage] = useState('');
  const [saveExists, setSaveExists] = useState(() => hasSave());
  const [flash, setFlash] = useState<string | null>(null);
  /** True when the current boss fight was launched from Level Select. */
  const [bossTestMode, setBossTestMode] = useState(false);
  const touchPauseRef = useRef(false);
  const { user } = useAuth();
  const uid = user?.id;

  // On sign-in: merge cloud + local progress and restore the newest mid-run save.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void syncFromCloud().then((s) => {
      if (!alive) return;
      setSpeed(s.speed);
      setFoodLimit(s.foodLimit);
      setSaveExists(hasSave());
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  const go = useCallback((s: GameState | 'FOOD_LIMIT_POPUP') => setScreen(s), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (screen === 'GAMEPLAY') {
          engine.persist();
          SFX.pause();
          setScreen('PAUSED');
        } else if (screen === 'PAUSED') {
          SFX.pause();
          setScreen('GAMEPLAY');
        }
      }
      if (e.key === 'Enter') {
        if (screen === 'LEVEL_COMPLETE') handleNextLevel();
        if (screen === 'GAME_OVER') {
          handleTryAgain();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, engine]);

  const startMode = (mode: GameMode, levelId = 1) => {
    setBossTestMode(false);
    engine.startNew(mode, levelId, speed);
    setSaveExists(true);
    SFX.select();
    setScreen('GAMEPLAY');
  };

  /** Jump straight into a boss arena — used for quick verification/testing. */
  const startBoss = (tier: number) => {
    setBossTestMode(true);
    engine.startBossFight(tier);
    setSaveExists(true);
    SFX.select();
    setScreen('GAMEPLAY');
  };

  const handleContinue = () => {
    if (engine.continueFromSave()) {
      SFX.select();
      setScreen('GAMEPLAY');
    } else {
      setMessage('No valid save found.');
      setSaveExists(false);
    }
  };

  const handleEvent = (ev: EngineEvent) => {
    if (ev.type === 'bonus_spawned') {
      SFX.levelUp();
      setFlash('★ BONUS FRUIT! +5 points — grab it before it vanishes!');
      setTimeout(() => setFlash(null), 2200);
      return;
    }
    if (ev.type === 'bonus_expired') {
      SFX.pause();
      setFlash('Bonus fruit vanished… streak reset');
      setTimeout(() => setFlash(null), 1600);
      return;
    }
    if (ev.type === 'ate_food') {
      if (ev.isFinal) SFX.finalEat();
      else SFX.eat();
      if (ev.isFinal && engine.mode === GAME_MODES.CONSTANT) {
        setFlash('★ Bonus Fruit! +5  ·  dragon keeps its size');
        setTimeout(() => setFlash(null), 1600);
      }
    } else if (ev.type === 'game_over') {
      SFX.die();
      setMessage(ev.reason);
      setSaveExists(false);
      setScreen('GAME_OVER');
    } else if (ev.type === 'level_complete') {
      SFX.levelUp();
      setScreen('LEVEL_COMPLETE');
    } else if (ev.type === 'boss_trapped') {
      SFX.win();
      setMessage(`Boss ${ev.tier} trapped! The warrior has no escape route.`);
      setScreen('LEVEL_COMPLETE');
    } else if (ev.type === 'final_victory') {
      SFX.win();
      setSaveExists(false);
      setScreen('FINAL_VICTORY');
    }
  };

  const handleNextLevel = () => {
    engine.advanceLevel();
    setSaveExists(true);
    if (engine.finalVictory) setScreen('FINAL_VICTORY');
    else setScreen('GAMEPLAY');
  };

  /**
   * After a Game Over:
   *  - Boss launched from Level Select → retry the SAME boss arena
   *  - Boss reached through the campaign → restart the run from Level 1
   *  - Other Level Based deaths        → restart the run from Level 1
   *  - Classic / Constant              → retry the same map
   */
  const handleTryAgain = () => {
    if (engine.isBossFight && bossTestMode) {
      engine.startBossFight(engine.bossTier);
    } else if (engine.mode === GAME_MODES.LEVEL_BASED) {
      engine.startNew(GAME_MODES.LEVEL_BASED, 1, speed);
    } else {
      engine.restartLevel(true);
    }
    setSaveExists(true);
    setScreen('GAMEPLAY');
  };

  const applySpeed = (s: SpeedName) => {
    setSpeed(s);
    setSpeedSetting(s);
    engine.speed = s;
    SFX.select();
  };

  // ——— Screens ———

  if (screen === 'MAIN_MENU') {
    return (
      <div className={isLight ? 'min-h-screen bg-[#dbeee2]' : 'min-h-screen bg-black'}>
        <MenuShell
          title="Dragon Arena"
          subtitle="Grow your dragon. Conquer ten realms. Claim the lair."
          footer="Arrow keys / WASD to move  ·  Esc or P to pause"
          cornerSlot={<ThemeToggle isLight={isLight} onToggle={onToggleTheme} />}
        >
          <div className="flex flex-col gap-3">
            <MenuButton
              label="New Game"
              icon="🔥"
              onClick={() => {
                SFX.select();
                setScreen('MODE_SELECT');
              }}
            />
            <MenuButton
              label="Continue Game"
              icon="💾"
              variant="secondary"
              disabled={!saveExists}
              badge={saveExists ? 'Save found' : 'Empty'}
              onClick={handleContinue}
            />
            <MenuButton
              label="Levels"
              icon="🗺️"
              variant="ghost"
              onClick={() => {
                SFX.select();
                setPendingMode(GAME_MODES.CONSTANT);
                setScreen('LEVEL_SELECT');
              }}
            />
            <MenuButton
              label="Speed"
              icon="⚡"
              variant="ghost"
              badge={`${speed} · ${foodLimit} foods`}
              onClick={() => {
                SFX.select();
                setScreen('SPEED_MENU');
              }}
            />
            <MenuButton
              label="Exit to DracoPyre Strike"
              icon="🚪"
              variant="danger"
              onClick={() => {
                SFX.select();
                setMessage('Heading back to DracoPyre Strike…');
                void exitToHub(); // progress is autosaved — nothing is cleared
              }}
            />
            {message && (
              <p className="mt-2 text-center text-sm text-amber-200/70">{message}</p>
            )}
          </div>
        </MenuShell>
      </div>
    );
  }

  if (screen === 'MODE_SELECT') {
    return (
      <div className={isLight ? 'min-h-screen bg-[#dbeee2]' : 'min-h-screen bg-black'}>
        <MenuShell
          title="Select Mode"
          subtitle="Choose how you want to play"
          cornerSlot={<ThemeToggle isLight={isLight} onToggle={onToggleTheme} />}
        >
          <div className="flex flex-col gap-3">
            <ModeCard
              title="Classic"
              desc="Endless open arena. Wrap through opposite sides. No walls. Survive and grow forever."
              icon="♾️"
              onClick={() => startMode(GAME_MODES.CLASSIC)}
            />
            <ModeCard
              title="Level Based"
              desc="Conquer 15 levels plus boss fights after Levels 5, 10 and 15. Trap the warrior with your body — never dash into him head-first."
              icon="🏆"
              onClick={() => {
                SFX.select();
                setScreen('FOOD_LIMIT_POPUP');
              }}
            />
            <ModeCard
              title="Constant Level"
              desc={`Endless play on one map. Every ${foodLimit} foods a TIMED ★ bonus fruit (+5) appears next to the normal fruit — chase the big one before it vanishes, or play it safe.`}
              icon="🎯"
              onClick={() => {
                SFX.select();
                setPendingMode(GAME_MODES.CONSTANT);
                setScreen('LEVEL_SELECT');
              }}
            />
            <MenuButton label="Back" variant="ghost" onClick={() => go('MAIN_MENU')} />
          </div>
        </MenuShell>
      </div>
    );
  }

  if (screen === 'LEVEL_SELECT') {
    return (
      <div className={isLight ? 'min-h-screen bg-[#dbeee2]' : 'min-h-screen bg-black'}>
        <MenuShell
          cornerSlot={<ThemeToggle isLight={isLight} onToggle={onToggleTheme} />}
          title="Select Level"
          subtitle={
            pendingMode === GAME_MODES.CONSTANT
              ? 'Constant mode — endless play on one map'
              : 'Choose a starting realm'
          }
        >
          <div className="mb-4 grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {LEVEL_META.map((lv) => (
              <button
                key={lv.id}
                type="button"
                onClick={() => {
                  setSelectedLevel(lv.id);
                  SFX.select();
                }}
                className={`rounded-xl border px-3 py-3 text-left transition-all ${
                  selectedLevel === lv.id
                    ? 'border-emerald-400 bg-emerald-600/30 shadow-lg shadow-emerald-900/40'
                    : 'border-white/10 bg-white/5 hover:border-emerald-500/30 hover:bg-white/10'
                }`}
              >
                <div className="text-xs font-bold text-emerald-300/70">Level {lv.id}</div>
                <div className="text-sm font-semibold text-emerald-50">{lv.name}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <MenuButton
              label={`Play Level ${selectedLevel}`}
              icon="🐉"
              onClick={() => startMode(pendingMode === GAME_MODES.LEVEL_BASED ? GAME_MODES.LEVEL_BASED : GAME_MODES.CONSTANT, selectedLevel)}
            />
          </div>

          <div
            className={`mt-5 mb-2 text-xs font-bold tracking-[0.2em] ${
              isLight ? 'text-red-700' : 'text-red-300/80'
            }`}
          >
            ⚔ BOSS FIGHTS — jump straight in to verify
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => startBoss(1)}
              className={`rounded-xl border px-2 py-3 text-center text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] ${
                isLight
                  ? 'border-red-700/25 bg-red-100/70 text-red-900 hover:bg-red-100'
                  : 'border-red-500/30 bg-red-950/40 text-red-100 hover:bg-red-900/50'
              }`}
            >
              Boss 1<br />
              <span className="text-[10px] font-medium opacity-70">no gaps</span>
            </button>
            <button
              type="button"
              onClick={() => startBoss(2)}
              className={`rounded-xl border px-2 py-3 text-center text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] ${
                isLight
                  ? 'border-red-700/25 bg-red-100/70 text-red-900 hover:bg-red-100'
                  : 'border-red-500/30 bg-red-950/40 text-red-100 hover:bg-red-900/50'
              }`}
            >
              Boss 2<br />
              <span className="text-[10px] font-medium opacity-70">symmetric gaps</span>
            </button>
            <button
              type="button"
              onClick={() => startBoss(3)}
              className={`rounded-xl border px-2 py-3 text-center text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] ${
                isLight
                  ? 'border-red-700/25 bg-red-100/70 text-red-900 hover:bg-red-100'
                  : 'border-red-500/30 bg-red-950/40 text-red-100 hover:bg-red-900/50'
              }`}
            >
              Boss 3<br />
              <span className="text-[10px] font-medium opacity-70">asymmetric gaps</span>
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <MenuButton
              label="Back"
              variant="ghost"
              onClick={() =>
                go(pendingMode === GAME_MODES.CONSTANT ? 'MODE_SELECT' : 'MAIN_MENU')
              }
            />
          </div>
        </MenuShell>
      </div>
    );
  }

  if (screen === 'SPEED_MENU') {
    const setLimit = (n: number) => {
      const v = clampFoodLimit(n);
      setFoodLimit(v);
      setFoodLimitSetting(v);
    };
    return (
      <div className={isLight ? 'min-h-screen bg-[#dbeee2]' : 'min-h-screen bg-black'}>
        <MenuShell
          title="Game Settings"
          subtitle="Speed, food limit and appearance"
          cornerSlot={<ThemeToggle isLight={isLight} onToggle={onToggleTheme} />}
        >
          <div className="mb-2 text-xs font-bold tracking-[0.2em] text-emerald-300/70">
            SPEED — moves per second
          </div>
          <div className="mb-6 flex flex-col gap-2">
            {SPEED_LABELS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => applySpeed(s)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 font-bold transition-all ${
                  speed === s
                    ? 'border-amber-400 bg-amber-600/30 text-amber-50'
                    : 'border-white/10 bg-white/5 text-emerald-100 hover:bg-white/10'
                }`}
              >
                <span>{s}</span>
                <span className="text-sm font-medium opacity-70">
                  {s === 'Beginner'
                    ? '4/s'
                    : s === 'Low'
                      ? '6/s'
                      : s === 'Mid'
                        ? '8/s'
                        : s === 'High'
                          ? '11/s'
                          : '15/s'}
                </span>
              </button>
            ))}
          </div>

          <div className="mb-2 text-xs font-bold tracking-[0.2em] text-amber-300/80">
            FOODS PER LEVEL — type any number
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setLimit(foodLimit - 1)}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-950/40 text-2xl font-black text-amber-100 transition-all hover:bg-amber-900/50 active:scale-95"
            >
              −
            </button>
            <input
              type="number"
              min={FOOD_MIN}
              max={FOOD_MAX}
              value={foodLimit}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) setLimit(v);
              }}
              className="w-28 rounded-xl border border-amber-500/40 bg-black/50 px-3 py-2.5 text-center text-2xl font-black text-amber-100 outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={() => setLimit(foodLimit + 1)}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-950/40 text-2xl font-black text-amber-100 transition-all hover:bg-amber-900/50 active:scale-95"
            >
              +
            </button>
          </div>
          <p
            className={`mt-2 text-center text-xs leading-relaxed ${
              isLight ? 'text-emerald-900/60' : 'text-emerald-100/50'
            }`}
          >
            Default {FOOD_DEFAULT} · you can type any value from {FOOD_MIN} to {FOOD_MAX}
            <br />
            +1 golden Final Food spawns once the limit is reached
          </p>

          <div
            className={`mt-6 mb-2 text-xs font-bold tracking-[0.2em] ${
              isLight ? 'text-teal-700' : 'text-teal-300/80'
            }`}
          >
            APPEARANCE
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (isLight) onToggleTheme();
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold transition-all ${
                !isLight
                  ? 'border-emerald-400 bg-emerald-600/30 text-emerald-50'
                  : 'border-emerald-900/15 bg-white/70 text-emerald-900 hover:bg-white'
              }`}
            >
              🌙 Dark
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isLight) onToggleTheme();
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold transition-all ${
                isLight
                  ? 'border-amber-500 bg-amber-200/70 text-amber-900'
                  : 'border-white/10 bg-white/5 text-emerald-100 hover:bg-white/10'
              }`}
            >
              ☀️ Light
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <MenuButton label="Back" variant="ghost" onClick={() => go('MAIN_MENU')} />
          </div>
        </MenuShell>
      </div>
    );
  }

  if (screen === 'FOOD_LIMIT_POPUP') {
    const setLimit = (n: number) => {
      const v = clampFoodLimit(n);
      setFoodLimit(v);
      setFoodLimitSetting(v);
    };
    return (
      <div className={isLight ? 'min-h-screen bg-[#dbeee2]' : 'min-h-screen bg-black'}>
        <MenuShell
          cornerSlot={<ThemeToggle isLight={isLight} onToggle={onToggleTheme} />}
          title="Level Based Setup"
          subtitle="Customize your Level Based food count before embarking"
        >
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-950/15 p-4 text-center">
            <div className="mb-3 text-xs font-bold tracking-[0.2em] text-amber-300 uppercase">
              Target Foods per Level
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setLimit(foodLimit - 1)}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-950/40 text-2xl font-black text-amber-100 transition-all hover:bg-amber-900/50 active:scale-95"
              >
                −
              </button>
              <input
                type="number"
                min={FOOD_MIN}
                max={FOOD_MAX}
                value={foodLimit}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v)) setLimit(v);
                }}
                className="w-28 rounded-xl border border-amber-500/40 bg-black/50 px-3 py-2.5 text-center text-2xl font-black text-amber-100 outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => setLimit(foodLimit + 1)}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-950/40 text-2xl font-black text-amber-100 transition-all hover:bg-amber-900/50 active:scale-95"
              >
                +
              </button>
            </div>
            <p className="mt-3 text-xs text-amber-200/50 leading-relaxed">
              Default is {FOOD_DEFAULT}. Set lower for a quick sprint or higher for a longer challenge.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <MenuButton
              label="Embark (Start Level 1)"
              icon="🐲"
              onClick={() => startMode(GAME_MODES.LEVEL_BASED, 1)}
            />
            <MenuButton
              label="Back to Mode Selection"
              variant="ghost"
              onClick={() => go('MODE_SELECT')}
            />
          </div>
        </MenuShell>
      </div>
    );
  }

  // Gameplay + overlays
  const showCanvas =
    screen === 'GAMEPLAY' ||
    screen === 'PAUSED' ||
    screen === 'GAME_OVER' ||
    screen === 'LEVEL_COMPLETE' ||
    screen === 'FINAL_VICTORY';

  if (showCanvas) {
    return (
      <div
        className={`flex min-h-screen flex-col items-center justify-start px-2 pt-2 pb-4 ${
          isLight
            ? 'bg-[radial-gradient(ellipse_at_center,#d6e6dc_0%,#b9cec6_100%)]'
            : 'bg-[radial-gradient(ellipse_at_center,#0d1f14_0%,#050a08_100%)]'
        }`}
      >
        <div className="mb-3 flex w-full max-w-[960px] items-center justify-between px-1">
          <h2
            className={`text-sm font-bold tracking-widest uppercase ${
              isLight ? 'text-emerald-800' : 'text-emerald-400/80'
            }`}
          >
            Dragon Arena
          </h2>
          <div className="flex items-center gap-2">
            <ThemeToggle isLight={isLight} onToggle={onToggleTheme} />
            {screen === 'GAMEPLAY' && (
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  isLight
                    ? 'border-emerald-900/15 bg-white/80 text-emerald-900 hover:bg-white'
                    : 'border-white/10 bg-black/40 text-emerald-100 hover:bg-white/10'
                }`}
                onClick={() => {
                  engine.persist();
                  SFX.pause();
                  setScreen('PAUSED');
                }}
              >
                Pause
              </button>
            )}
            <button
              type="button"
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                isLight
                  ? 'border-emerald-900/15 bg-white/80 text-emerald-900/80 hover:bg-white'
                  : 'border-white/10 bg-black/40 text-emerald-100/70 hover:bg-white/10'
              }`}
              onClick={() => {
                engine.persist();
                setSaveExists(hasSave());
                setScreen('MAIN_MENU');
              }}
            >
              Menu
            </button>
          </div>
        </div>

        <div className="relative -translate-y-3">
          <GameCanvas
            engine={engine}
            running={screen === 'GAMEPLAY'}
            onEvent={handleEvent}
            isLight={isLight}
          />

          {flash && (
            <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
              <div
                className={`rounded-full border px-4 py-2 text-sm font-bold shadow-lg backdrop-blur ${
                  isLight
                    ? 'border-amber-600/40 bg-white/90 text-amber-800'
                    : 'border-amber-400/40 bg-black/70 text-amber-200'
                }`}
              >
                {flash}
              </div>
            </div>
          )}

          {screen === 'PAUSED' && (
            <Overlay>
              <h3 className="mb-1 text-3xl font-black text-amber-200">Paused</h3>
              <p className="mb-6 text-sm text-emerald-100/60">Esc / P to resume</p>
              <div className="flex w-64 flex-col gap-2">
                <MenuButton label="Resume" icon="▶️" onClick={() => setScreen('GAMEPLAY')} />
                <MenuButton
                  label="Restart Level"
                  variant="secondary"
                  onClick={() => {
                    engine.restartLevel(true);
                    setScreen('GAMEPLAY');
                  }}
                />
                <MenuButton
                  label="Main Menu"
                  variant="ghost"
                  onClick={() => {
                    engine.persist();
                    setSaveExists(hasSave());
                    setScreen('MAIN_MENU');
                  }}
                />
              </div>
            </Overlay>
          )}

          {screen === 'GAME_OVER' && (
            <Overlay>
              <h3 className="mb-1 text-3xl font-black text-red-300">Game Over</h3>
              <p className="mb-1 text-sm text-red-100/70">{message || engine.gameOverReason}</p>
              <p className="mb-1 text-lg font-bold text-amber-200">Score: {engine.score}</p>
              {engine.isBossFight && bossTestMode ? (
                <p className="mb-5 text-xs text-red-200/60">
                  Boss practice — retry the same arena instantly
                </p>
              ) : engine.mode === GAME_MODES.LEVEL_BASED ? (
                <p className="mb-5 text-xs text-red-200/60">
                  Your journey resets — back to Level 1
                </p>
              ) : (
                <div className="mb-6" />
              )}
              <div className="flex w-64 flex-col gap-2">
                <MenuButton
                  label={
                    engine.isBossFight && bossTestMode
                      ? `Retry Boss ${engine.bossTier}`
                      : engine.mode === GAME_MODES.LEVEL_BASED
                        ? 'Restart from Level 1'
                        : 'Try Again'
                  }
                  icon="🔄"
                  onClick={handleTryAgain}
                />
                <MenuButton
                  label="Main Menu"
                  variant="ghost"
                  onClick={() => {
                    setSaveExists(hasSave());
                    setScreen('MAIN_MENU');
                  }}
                />
              </div>
            </Overlay>
          )}

          {screen === 'LEVEL_COMPLETE' && (
            <Overlay>
              <h3 className="mb-1 text-3xl font-black text-emerald-300">
                {engine.isBossFight ? 'Boss Trapped!' : 'Level Complete!'}
              </h3>
              <p className="mb-1 text-sm text-emerald-100/70">
                {engine.isBossFight ? message : `${engine.level.name} cleared`}
              </p>
              <p className="mb-6 text-lg font-bold text-amber-200">Score: {engine.score}</p>
              <div className="flex w-64 flex-col gap-2">
                {engine.isBossFight && bossTestMode ? (
                  <>
                    <MenuButton
                      label={`Replay Boss ${engine.bossTier}`}
                      icon="🔄"
                      onClick={() => startBoss(engine.bossTier)}
                    />
                    <MenuButton
                      label="Back to Level Select"
                      variant="secondary"
                      onClick={() => {
                        setBossTestMode(false);
                        setSaveExists(hasSave());
                        setScreen('LEVEL_SELECT');
                      }}
                    />
                  </>
                ) : engine.mode === GAME_MODES.LEVEL_BASED ? (
                  <MenuButton
                    label={
                      engine.isBossFight
                        ? engine.bossTier >= 3
                          ? 'Claim Final Victory'
                          : `Continue to Level ${engine.levelId + 1}`
                        : engine.levelId % 5 === 0
                          ? `Enter Boss Fight ${Math.ceil(engine.levelId / 5)}`
                          : `Continue to Level ${engine.levelId + 1}`
                    }
                    icon="🐉"
                    onClick={handleNextLevel}
                  />
                ) : null}
                <MenuButton
                  label="Main Menu"
                  variant="ghost"
                  onClick={() => {
                    setSaveExists(hasSave());
                    setScreen('MAIN_MENU');
                  }}
                />
              </div>
            </Overlay>
          )}

          {screen === 'FINAL_VICTORY' && (
            <Overlay>
              <div className="mb-2 text-5xl">👑</div>
              <h3 className="mb-1 text-3xl font-black text-amber-200">Final Victory!</h3>
              <p className="mb-1 text-sm text-emerald-100/70">
                You conquered all 15 levels and trapped every warrior boss
              </p>
              <p className="mb-6 text-lg font-bold text-amber-200">Final Score: {engine.score}</p>
              <div className="flex w-64 flex-col gap-2">
                <MenuButton
                  label="Play Again"
                  icon="🔥"
                  onClick={() => startMode(GAME_MODES.LEVEL_BASED, 1)}
                />
                <MenuButton
                  label="Main Menu"
                  variant="ghost"
                  onClick={() => setScreen('MAIN_MENU')}
                />
              </div>
            </Overlay>
          )}
        </div>

        <p className="mt-3 max-w-md text-center text-xs text-emerald-200/40">
          Arrows / WASD · Esc pause · Eat {foodLimit} foods to summon the golden Final Food, then devour it
        </p>

        {/* hidden touch pause helper */}
        <button
          type="button"
          className="sr-only"
          onClick={() => {
            touchPauseRef.current = !touchPauseRef.current;
          }}
        />
      </div>
    );
  }

  return null;
}

function ModeCard({
  title,
  desc,
  icon,
  onClick,
}: {
  title: string;
  desc: string;
  icon: string;
  onClick: () => void;
}) {
  const isLight = useLightMode();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99] ${
        isLight
          ? 'border-emerald-800/15 bg-gradient-to-br from-white/85 to-emerald-50/70 hover:border-emerald-600/35 hover:from-white'
          : 'border-emerald-500/20 bg-gradient-to-br from-emerald-950/60 to-black/40 hover:border-emerald-400/40 hover:from-emerald-900/50'
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span
          className={`text-lg font-bold ${isLight ? 'text-emerald-900' : 'text-emerald-100'}`}
        >
          {title}
        </span>
      </div>
      <p
        className={`text-sm leading-relaxed ${
          isLight ? 'text-emerald-900/65' : 'text-emerald-100/55'
        }`}
      >
        {desc}
      </p>
    </button>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  const isLight = useLightMode();
  return (
    <div
      className={`absolute inset-0 z-20 flex items-center justify-center rounded-xl backdrop-blur-sm ${
        isLight ? 'bg-white/60' : 'bg-black/70'
      }`}
    >
      <div
        className={`mx-4 flex flex-col items-center rounded-2xl border px-8 py-8 text-center shadow-2xl ${
          isLight
            ? 'border-emerald-800/15 bg-gradient-to-b from-white/95 to-emerald-50/95'
            : 'border-emerald-500/20 bg-gradient-to-b from-emerald-950/90 to-black/90'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
