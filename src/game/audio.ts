/** Lightweight Web Audio SFX — no external assets required */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'square',
  vol = 0.08,
  slideTo?: number
): void {
  const a = ac();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  if (slideTo !== undefined) {
    osc.frequency.linearRampToValueAtTime(slideTo, a.currentTime + dur);
  }
  gain.gain.value = vol;
  gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  osc.connect(gain);
  gain.connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur);
}

export const SFX = {
  eat: () => {
    tone(520, 0.08, 'square', 0.07);
    setTimeout(() => tone(780, 0.1, 'square', 0.06), 60);
  },
  finalEat: () => {
    tone(440, 0.1, 'sine', 0.1);
    setTimeout(() => tone(660, 0.12, 'sine', 0.1), 80);
    setTimeout(() => tone(880, 0.2, 'sine', 0.08), 160);
  },
  die: () => {
    tone(300, 0.3, 'sawtooth', 0.09, 80);
  },
  move: () => {
    // soft click optional — kept quiet
  },
  select: () => {
    tone(660, 0.05, 'sine', 0.05);
  },
  pause: () => {
    tone(400, 0.08, 'triangle', 0.06);
  },
  win: () => {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => tone(f, 0.18, 'sine', 0.08), i * 120);
    });
  },
  levelUp: () => {
    [392, 523, 659].forEach((f, i) => {
      setTimeout(() => tone(f, 0.12, 'square', 0.06), i * 100);
    });
  },
};
