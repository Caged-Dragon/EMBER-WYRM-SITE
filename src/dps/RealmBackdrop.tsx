import { useEffect, useMemo, useRef, useState } from 'react';
import './fx.css';

export type RealmPalette = 'ember' | 'emerald' | 'frost' | 'storm' | 'void' | 'gold';
type Kind = 'embers' | 'spores' | 'snow' | 'ash';

interface PaletteDef {
  sky: [string, string, string];
  glow: string; // r,g,b
  fog: string;
  far: string;
  mid: string;
  near: string;
  spark: string[]; // r,g,b list
  kind: Kind;
  lava: boolean;
}

export const PALETTES: Record<RealmPalette, PaletteDef> = {
  ember: { sky: ['#06020a', '#1a0709', '#431106'], glow: '255,110,40', fog: '255,90,40', far: '#1c0a0d', mid: '#110608', near: '#070304', spark: ['255,200,100', '255,125,45', '255,70,30'], kind: 'embers', lava: true },
  gold: { sky: ['#090502', '#2b1807', '#63380f'], glow: '255,190,60', fog: '255,170,60', far: '#241406', mid: '#160c04', near: '#090502', spark: ['255,235,160', '255,190,60', '255,150,40'], kind: 'embers', lava: true },
  emerald: { sky: ['#020a08', '#07221b', '#0c4130'], glow: '60,220,150', fog: '40,200,130', far: '#08281f', mid: '#051a12', near: '#020b08', spark: ['160,255,205', '90,235,165', '210,255,130'], kind: 'spores', lava: false },
  frost: { sky: ['#040815', '#0a1b3d', '#134574'], glow: '110,200,255', fog: '100,180,255', far: '#0b2344', mid: '#071632', near: '#040b1c', spark: ['220,244,255', '160,214,255', '255,255,255'], kind: 'snow', lava: false },
  storm: { sky: ['#07070f', '#1d1838', '#3d3070'], glow: '250,205,70', fog: '170,150,255', far: '#17122e', mid: '#0e0a20', near: '#06040f', spark: ['255,236,150', '255,205,70', '190,170,255'], kind: 'ash', lava: false },
  void: { sky: ['#07020f', '#1c0a36', '#38125f'], glow: '190,90,255', fog: '170,80,255', far: '#1a0a33', mid: '#100620', near: '#07020f', spark: ['230,170,255', '190,100,255', '255,255,255'], kind: 'spores', lava: false },
};

/* ---------------- procedural scenery ---------------- */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const W = 1600;
const H = 600;
function ridge(seed: number, base: number, amp: number, steps: number, jag: number): string {
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W;
    const wave = 0.5 + 0.5 * Math.sin(i * 0.37 + seed) * Math.cos(i * 0.11 + seed * 0.3);
    const y = base - amp * (0.25 * wave + 0.75 * wave * (1 - jag + jag * r()));
    pts.push([x, y]);
  }
  return `M0 ${H} L${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')} L${W} ${H} Z`;
}

function Dragon() {
  return (
    <svg viewBox="0 0 240 120" aria-hidden="true">
      <g fill="currentColor">
        <path className="rb-wing far" d="M112 56 L74 0 Q82 20 70 30 Q86 30 84 46 Q98 42 98 56 Q104 50 112 56Z" />
        <path d="M4 88 C14 76 24 72 34 68 C28 60 24 56 16 54 C32 52 52 52 72 54 C96 55 124 55 146 48 C158 43 168 41 178 43 L200 38 L212 40 L202 48 C206 52 204 58 194 60 C176 62 160 72 138 76 C112 80 84 76 62 71 C46 67 40 70 32 76 C24 82 14 88 4 88Z" />
        <path className="rb-wing" d="M112 58 L58 6 Q70 24 56 36 Q76 34 72 52 Q90 46 92 62 Q102 54 112 58Z" />
      </g>
      <circle cx="198" cy="43" r="1.8" fill="rgb(255,190,80)" />
    </svg>
  );
}

/* ---------------- component ---------------- */
interface Props {
  palette?: RealmPalette | RealmPalette[];
  cycleMs?: number;
  image?: string;
  imageOpacity?: number;
  scene?: boolean;
  dragons?: boolean;
  intensity?: number;
  /** absolute inside the nearest positioned parent instead of fixed to the viewport */
  contained?: boolean;
  className?: string;
  /** called whenever the active palette (realm) changes */
  onIndex?: (i: number) => void;
}

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(rgb: string) {
  let c = sprites.get(rgb);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.25, `rgba(${rgb},.55)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 48, 48);
    sprites.set(rgb, c);
  }
  return c;
}

interface P { x: number; y: number; vx: number; vy: number; r: number; age: number; life: number; ph: number; col: string }

export function RealmBackdrop({ palette = 'ember', cycleMs = 9000, image, imageOpacity = 0.5, scene = true, dragons = true, intensity = 1, contained = false, className = '', onIndex }: Props) {
  const list = useMemo(() => (Array.isArray(palette) ? palette : [palette]), [palette]);
  const [idx, setIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cur = PALETTES[list[idx % list.length]];
  const curRef = useRef(cur);
  curRef.current = cur;

  useEffect(() => {
    onIndex?.(idx % list.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), cycleMs);
    return () => clearInterval(t);
  }, [list, cycleMs]);

  const layers = useMemo(
    () => ({
      far: ridge(7, 330, 250, 26, 0.25),
      mid: ridge(21, 380, 240, 34, 0.55),
      near: ridge(43, 440, 200, 44, 0.8),
      front: ridge(88, 520, 130, 60, 0.9),
    }),
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now();
    let tx = 0, ty = 0, px = 0, py = 0, sy = 0;
    const parts: P[] = [];

    const target = () => Math.round(Math.min(90, Math.max(14, (w * h) / 17000)) * intensity);
    const spawn = (initial: boolean): P => {
      const def = curRef.current;
      const col = def.spark[Math.floor(Math.random() * def.spark.length)];
      const k = def.kind;
      const s = h / 900 + 0.35;
      const p: P = { x: Math.random() * w, y: 0, vx: 0, vy: 0, r: 0.7 + Math.random() * 2.1, age: 0, life: 6 + Math.random() * 9, ph: Math.random() * 6.28, col };
      if (k === 'embers') { p.y = initial ? Math.random() * h : h + 10; p.vy = -(22 + Math.random() * 46) * s; p.vx = (Math.random() - 0.3) * 18; }
      else if (k === 'snow') { p.y = initial ? Math.random() * h : -10; p.vy = (16 + Math.random() * 34) * s; p.vx = (Math.random() - 0.5) * 12; p.r *= 0.9; }
      else if (k === 'ash') { p.y = initial ? Math.random() * h : -10; p.vy = (10 + Math.random() * 22) * s; p.vx = 14 + Math.random() * 20; p.r *= 0.75; }
      else { p.y = Math.random() * h; p.vy = -(3 + Math.random() * 9) * s; p.vx = (Math.random() - 0.5) * 8; p.r *= 1.2; }
      if (initial) p.age = Math.random() * p.life;
      return p;
    };

    const resize = () => {
      w = root.clientWidth; h = root.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = target();
      while (parts.length < n) parts.push(spawn(true));
      parts.length = Math.min(parts.length, n);
    };

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < parts.length; i++) {
        let p = parts[i];
        p.age += dt;
        p.x += (p.vx + Math.sin(p.age * 0.9 + p.ph) * 10) * dt;
        p.y += p.vy * dt;
        if (p.age > p.life || p.y < -20 || p.y > h + 20 || p.x > w + 20 || p.x < -20) { p = parts[i] = spawn(false); }
        const t = p.age / p.life;
        const fade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 3);
        const flick = 0.75 + 0.25 * Math.sin(p.age * 7 + p.ph);
        ctx.globalAlpha = Math.max(0, Math.min(1, fade * flick * 0.95));
        const size = p.r * 9;
        ctx.drawImage(sprite(p.col), p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      px += (tx - px) * Math.min(1, dt * 3.2);
      py += (ty - py) * Math.min(1, dt * 3.2);
      sy = contained ? 0 : window.scrollY;
      root.style.setProperty('--px', px.toFixed(3));
      root.style.setProperty('--py', py.toFixed(3));
      root.style.setProperty('--sy', sy.toFixed(1));
      draw(dt);
      raf = requestAnimationFrame(frame);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame); }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    if (reduce) { draw(0.016); }
    else {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('visibilitychange', onVis);
      raf = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intensity, contained]);

  const style = {
    '--rb-glow': cur.glow,
    '--rb-fog': cur.fog,
    '--rb-img-o': imageOpacity,
  } as React.CSSProperties;

  return (
    <div ref={rootRef} className={`rb-root ${contained ? 'rb-abs' : ''} ${className}`} style={style} aria-hidden="true">
      {list.map((k, i) => {
        const p = PALETTES[k];
        return <div key={k} className={`rb-sky ${i === idx % list.length ? 'on' : ''}`} style={{ background: `linear-gradient(180deg, ${p.sky[0]} 0%, ${p.sky[1]} 52%, ${p.sky[2]} 100%)` }} />;
      })}
      {image && <div className="rb-img" style={{ backgroundImage: `url(${image})` }} />}
      <div className="rb-aurora" />
      <div className="rb-glow" />
      {scene && (
        <>
          <div className="rb-layer rb-l1"><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice"><path className="rb-fill" d={layers.far} style={{ fill: cur.far }} />{cur.lava && <g><path className="rb-lava" d="M1180 215 l-14 52 l22 28 l-18 60" /><path className="rb-lava" style={{ animationDelay: '-1.6s' }} d="M1190 222 l18 44 l-12 36 l24 50" /></g>}</svg></div>
          <div className="rb-fog f2" />
          <div className="rb-layer rb-l2"><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice"><path className="rb-fill" d={layers.mid} style={{ fill: cur.mid }} /></svg></div>
          {dragons && (<><div className="rb-dragon d2"><Dragon /></div><div className="rb-dragon d1"><Dragon /></div></>)}
          <div className="rb-layer rb-l3"><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice"><path className="rb-fill" d={layers.near} style={{ fill: cur.near }} /></svg></div>
          <div className="rb-fog f1" />
          <div className="rb-layer rb-l4"><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice"><path className="rb-fill" d={layers.front} style={{ fill: '#020104' }} /></svg></div>
        </>
      )}
      <canvas ref={canvasRef} className="rb-canvas" />
      <div className="rb-vig" />
      <div className="rb-grain" />
    </div>
  );
}
