import { CELL_SIZE, SCREEN_HEIGHT, SCREEN_WIDTH } from '../constants';
import type { GameEngine } from '../engine';
import { drawDragon } from './dragonRenderer';
import {
  drawAmbient,
  drawParticles,
  updateAmbient,
  updateParticles,
  updateShake,
} from './effects';
import {
  drawBackground,
  drawHUDPanel,
  drawOpenings,
  drawWalls,
  toLightPalette,
} from './environment';
import { drawFoodSprite } from './foodRenderer';
import type { ThemeColors } from '../types';
import { drawWarrior } from './warriorRenderer';

let lastGlow = 0;
let lastGlowTime = 0;

/** External trigger: called when the dragon eats something */
export function pulseDragonGlow(strong = false): void {
  lastGlow = strong ? 1.4 : 0.9;
  lastGlowTime = performance.now() / 1000;
}

// Cache lightened palettes so we don't rebuild them every frame
const lightPaletteCache = new Map<string, ThemeColors>();
function lightPaletteFor(theme: string, colors: ThemeColors): ThemeColors {
  let p = lightPaletteCache.get(theme);
  if (!p) {
    p = toLightPalette(colors);
    lightPaletteCache.set(theme, p);
  }
  return p;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  time: number,
  dt: number,
  isLight = false
): void {
  const level = engine.level;
  const baseColors = level.environment.colors;
  const colors = isLight ? lightPaletteFor(level.theme, baseColors) : baseColors;

  // Update ambient world state
  updateAmbient(level.theme, dt);
  updateParticles(dt);
  const shake = updateShake(dt);

  ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  // Apply screen shake — everything in-world uses this offset
  ctx.save();
  ctx.translate(shake.x, shake.y);

  // 1. Painted background
  drawBackground(ctx, colors, level.theme, time, isLight);

  // 2. Ambient screen particles — dimmed in daylight so they read correctly
  ctx.save();
  if (isLight) ctx.globalAlpha = 0.45;
  drawAmbient(ctx);
  ctx.restore();

  // 3. Walls with ambient occlusion
  drawWalls(ctx, engine.walls, colors, level.theme);

  // 4. Portals (animated glowing gates)
  if (level.openings.length > 0) {
    drawOpenings(ctx, level, time);
  }

  // 5. Normal food
  if (engine.food.position) {
    drawFoodSprite(
      ctx,
      engine.food.position.x,
      engine.food.position.y,
      engine.food.isFinal,
      colors,
      time
    );
  }

  // 5b. Timed bonus fruit (Constant mode) — coexists with the normal fruit
  if (engine.bonusFood.position) {
    drawFoodSprite(
      ctx,
      engine.bonusFood.position.x,
      engine.bonusFood.position.y,
      true,
      colors,
      time,
      engine.bonusProgress
    );
  }

  // 5c. Boss warrior — glides smoothly between cells like the dragon
  if (engine.isBossFight && engine.warrior.position) {
    drawWarrior(
      ctx,
      engine.warrior.position,
      time,
      isLight,
      engine.warriorPrev,
      engine.interpolation
    );
  }

  // 6. Dragon
  const glowPulse = Math.max(0, lastGlow - (time - lastGlowTime) * 2.2);
  drawDragon(
    ctx,
    engine.dragon.body,
    engine.dragon.direction,
    glowPulse,
    engine.interpolation,
    engine.previousDragonBody
  );

  // 7. Effect particles
  drawParticles(ctx);

  ctx.restore();

  // 8. HUD panel (outside the shake so it stays crisp)
  const showProgress = engine.mode !== 'classic';
  drawHUDPanel(ctx, {
    score: engine.score,
    length: engine.dragonLength,
    foods: engine.foodsEaten,
    limit: engine.foodLimit,
    levelName:
      engine.mode === 'classic'
        ? 'Classic Arena'
        : engine.isBossFight
          ? `Boss ${engine.bossTier}: ${level.name}`
        : `Lv.${engine.levelId} ${level.name}`,
    mode: engine.mode,
    speed: engine.speed,
    highScore: engine.highScore,
    showProgress,
    isLight,
    isBossFight: engine.isBossFight,
    bossVulnerable: engine.bossWarriorVulnerable,
    bonusProgress: engine.bonusFood.position ? engine.bonusProgress : -1,
  });

  // 9. "PRESS ANY KEY" overlay
  if (
    engine.waitingToStart &&
    engine.alive &&
    !engine.levelComplete &&
    !engine.finalVictory
  ) {
    // Text stays FULLY OPAQUE at all times; only the soft glow behind it
    // pulses. (The old version pulsed the text alpha down to ~0.15, which
    // made it look faded and hard to read.)
    const glowPulseT = 0.55 + Math.sin(time * 6) * 0.4;
    ctx.save();
    const g = ctx.createRadialGradient(
      SCREEN_WIDTH / 2,
      SCREEN_HEIGHT / 2,
      100,
      SCREEN_WIDTH / 2,
      SCREEN_HEIGHT / 2,
      SCREEN_WIDTH * 0.7
    );
    if (isLight) {
      g.addColorStop(0, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(210,220,230,0.82)');
    } else {
      g.addColorStop(0, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0.72)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 44, SCREEN_WIDTH, SCREEN_HEIGHT - 44);

    ctx.textAlign = 'center';

    const title = 'PRESS ANY MOVEMENT KEY TO FLY!';
    const titleY = SCREEN_HEIGHT / 2 - 10;

    // Pulsing glow bloom behind the text (dark mode only)
    if (!isLight) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 220, 130, ${glowPulseT * 0.45})`;
      for (let i = 4; i > 0; i--) {
        ctx.font = `bold ${26 + i * 3}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillText(title, SCREEN_WIDTH / 2, titleY);
      }
      ctx.restore();
    }

    // Crisp main title: solid fill + contrasting outline, no alpha fade
    ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)';
    ctx.strokeText(title, SCREEN_WIDTH / 2, titleY);
    ctx.fillStyle = isLight ? '#14421c' : '#ffffff';
    ctx.fillText(title, SCREEN_WIDTH / 2, titleY);

    // Subtitle: solid, outlined for readability on any background
    const subtitle = engine.isBossFight
      ? 'Boss rule: trap the warrior with your BODY. Head collision eliminates you.'
      : 'Use Arrow Keys or WASD to control your dragon';
    ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';
    ctx.strokeText(subtitle, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 24);
    ctx.fillStyle = isLight ? '#1e5e3a' : '#c8f0c0';
    ctx.fillText(subtitle, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 24);
    ctx.restore();
  }

  // 10. Short in-world result message during the delayed overlay window.
  // This appears before React swaps to Game Over / Level Complete menus.
  if (!engine.alive || engine.levelComplete) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const isLoss = !engine.alive;
    const title = isLoss
      ? `Eliminated: ${engine.gameOverReason}`
      : engine.isBossFight
        ? 'Boss trapped! Warrior has no escape.'
        : 'Level complete!';
    const y = SCREEN_HEIGHT * 0.55;
    const w = Math.min(620, SCREEN_WIDTH - 80);
    const x = SCREEN_WIDTH / 2 - w / 2;

    ctx.fillStyle = isLight ? 'rgba(255,255,255,0.76)' : 'rgba(0,0,0,0.62)';
    ctx.beginPath();
    ctx.roundRect(x, y - 34, w, 68, 18);
    ctx.fill();
    ctx.strokeStyle = isLoss
      ? 'rgba(255,90,70,0.75)'
      : 'rgba(120,230,160,0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = isLoss
      ? isLight ? '#8f1e16' : '#ffb0a0'
      : isLight ? '#1e5e3a' : '#b8ffd0';
    ctx.fillText(title, SCREEN_WIDTH / 2, y - 8);

    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = isLight ? 'rgba(35,55,40,0.75)' : 'rgba(235,255,240,0.75)';
    ctx.fillText('Review the arena position before continuing...', SCREEN_WIDTH / 2, y + 18);
    ctx.restore();
  }
}

export { CELL_SIZE };
