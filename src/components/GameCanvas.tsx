import { useEffect, useRef } from 'react';
import { CELL_SIZE, SCREEN_HEIGHT, SCREEN_WIDTH, type DirectionName } from '../game/constants';
import type { GameEngine, EngineEvent } from '../game/engine';
import { drawFrame, pulseDragonGlow } from '../game/render/drawFrame';
import {
  emitDeathBurst,
  emitEatBurst,
  emitFinalBurst,
  emitPortalRing,
  triggerShake,
} from '../game/render/effects';

interface Props {
  engine: GameEngine;
  running: boolean;
  onEvent: (e: EngineEvent) => void;
  isLight?: boolean;
}

export function GameCanvas({ engine, running, onEvent, isLight = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const engineRef = useRef(engine);
  const runningRef = useRef(running);
  const onEventRef = useRef(onEvent);
  const isLightRef = useRef(isLight);

  engineRef.current = engine;
  runningRef.current = running;
  onEventRef.current = onEvent;
  isLightRef.current = isLight;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, DirectionName> = {
        ArrowUp: 'UP',
        ArrowDown: 'DOWN',
        ArrowLeft: 'LEFT',
        ArrowRight: 'RIGHT',
        w: 'UP',
        W: 'UP',
        s: 'DOWN',
        S: 'DOWN',
        a: 'LEFT',
        A: 'LEFT',
        d: 'RIGHT',
        D: 'RIGHT',
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        engineRef.current.setDirection(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    lastRef.current = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;
      const eng = engineRef.current;

      if (runningRef.current) {
        const ev = eng.update(dt);
        if (ev.type !== 'none') {
          // Fire visual effects based on the event
          if (ev.type === 'ate_food') {
            const head = eng.dragon.body[0];
            const px = head.x * CELL_SIZE + CELL_SIZE / 2;
            const py = head.y * CELL_SIZE + CELL_SIZE / 2;
            if (ev.isFinal) {
              emitFinalBurst(px, py);
              triggerShake(8, 4);
              pulseDragonGlow(true);
            } else {
              emitEatBurst(px, py);
              pulseDragonGlow(false);
            }
          } else if (ev.type === 'game_over') {
            const head = eng.dragon.body[0];
            const px = head.x * CELL_SIZE + CELL_SIZE / 2;
            const py = head.y * CELL_SIZE + CELL_SIZE / 2;
            emitDeathBurst(px, py);
          } else if (ev.type === 'bonus_spawned' && eng.bonusFood.position) {
            // The pellet that triggered it still gets its normal eat effect
            const head = eng.dragon.body[0];
            emitEatBurst(
              head.x * CELL_SIZE + CELL_SIZE / 2,
              head.y * CELL_SIZE + CELL_SIZE / 2
            );
            pulseDragonGlow(false);
            // Flash a ring at the bonus fruit so the player notices it
            const bx = eng.bonusFood.position.x * CELL_SIZE + CELL_SIZE / 2;
            const by = eng.bonusFood.position.y * CELL_SIZE + CELL_SIZE / 2;
            emitPortalRing(bx, by, 'rgb(255, 210, 90)');
            triggerShake(3, 6);
          }
          const delayed =
            ev.type === 'game_over' ||
            ev.type === 'level_complete' ||
            ev.type === 'final_victory' ||
            ev.type === 'boss_trapped';
          if (delayed) {
            window.setTimeout(() => onEventRef.current(ev), 1100);
          } else {
            onEventRef.current(ev);
          }
        }
      }

      drawFrame(ctx, eng, now / 1000, dt, isLightRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handlePad = (dir: DirectionName) => {
    engine.setDirection(dir);
  };

  return (
    <div className="relative flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        className="max-h-[min(720px,70vh)] max-w-full rounded-xl border border-emerald-500/30 shadow-2xl shadow-black/60"
        style={{ imageRendering: 'auto' }}
      />

      {/* Mobile D-pad */}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:hidden">
        <div />
        <PadBtn label="▲" onPress={() => handlePad('UP')} />
        <div />
        <PadBtn label="◀" onPress={() => handlePad('LEFT')} />
        <PadBtn label="▼" onPress={() => handlePad('DOWN')} />
        <PadBtn label="▶" onPress={() => handlePad('RIGHT')} />
      </div>
    </div>
  );
}

function PadBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/80 text-xl text-emerald-100 active:bg-emerald-700/60"
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
    >
      {label}
    </button>
  );
}
