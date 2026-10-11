import { createContext, useContext, type ReactNode } from 'react';

/** Lets nested controls (buttons) pick up light/dark without prop drilling */
export const LightModeContext = createContext(false);
export const useLightMode = () => useContext(LightModeContext);

export function LightModeProvider({
  isLight,
  children,
}: {
  isLight: boolean;
  children: ReactNode;
}) {
  return <LightModeContext.Provider value={isLight}>{children}</LightModeContext.Provider>;
}

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  isLight?: boolean;
  /** Rendered in the top-right corner (theme toggle) */
  cornerSlot?: ReactNode;
}

export function MenuShell({
  title,
  subtitle,
  children,
  footer,
  isLight: isLightProp,
  cornerSlot,
}: Props) {
  const ctxLight = useLightMode();
  const isLight = isLightProp ?? ctxLight;
  return (
    <div className="relative flex min-h-full w-full flex-col items-center justify-center overflow-hidden px-4 py-8">
      {/* Animated backdrop */}
      <div
        className={
          isLight
            ? 'pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#d8eadc_0%,#c7ddd0_45%,#b8d0c8_100%)]'
            : 'pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#1a4a2a_0%,#0a1a12_45%,#050a08_100%)]'
        }
      />
      <div className={`pointer-events-none absolute inset-0 ${isLight ? 'opacity-60' : 'opacity-40'}`}>
        <div
          className={`absolute left-[10%] top-[20%] h-64 w-64 animate-pulse rounded-full blur-3xl ${
            isLight ? 'bg-emerald-400/24' : 'bg-emerald-600/20'
          }`}
        />
        <div
          className={`absolute bottom-[15%] right-[15%] h-72 w-72 animate-pulse rounded-full blur-3xl [animation-delay:1s] ${
            isLight ? 'bg-amber-400/20' : 'bg-amber-600/15'
          }`}
        />
        <div
          className={`absolute left-[40%] top-[60%] h-40 w-40 animate-pulse rounded-full blur-2xl [animation-delay:2s] ${
            isLight ? 'bg-teal-400/18' : 'bg-teal-500/10'
          }`}
        />
      </div>

      {/* Decorative dragon silhouette marks */}
      <div className={`pointer-events-none absolute left-6 top-6 text-6xl ${isLight ? 'opacity-20' : 'opacity-10'}`}>
        🐉
      </div>
      <div className={`pointer-events-none absolute bottom-8 right-8 text-6xl ${isLight ? 'opacity-20' : 'opacity-10'}`}>
        ⚔️
      </div>

      {cornerSlot && <div className="absolute right-4 top-4 z-20">{cornerSlot}</div>}

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-8 text-center">
          <div
            className={`mb-3 inline-flex items-center gap-2 rounded-full border px-4 py-1 text-xs font-semibold tracking-[0.2em] uppercase ${
              isLight
                ? 'border-emerald-600/30 bg-white/70 text-emerald-800'
                : 'border-emerald-500/30 bg-emerald-950/50 text-emerald-300/90'
            }`}
          >
            Top-View
          </div>
          <h1
            className={`bg-clip-text text-4xl font-black tracking-tight text-transparent drop-shadow-lg sm:text-5xl ${
              isLight
                ? 'bg-gradient-to-r from-amber-700 via-emerald-700 to-teal-700'
                : 'bg-gradient-to-r from-amber-200 via-emerald-300 to-teal-200'
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <p className={`mt-3 text-sm sm:text-base ${isLight ? 'text-emerald-900/70' : 'text-emerald-100/60'}`}>
              {subtitle}
            </p>
          )}
        </div>

        <div
          className={`rounded-2xl border p-5 shadow-2xl backdrop-blur-md sm:p-6 ${
            isLight
              ? 'border-emerald-700/15 bg-white/75 shadow-emerald-900/10'
              : 'border-emerald-500/20 bg-black/40 shadow-emerald-950/50'
          }`}
        >
          {children}
        </div>

        {footer && (
          <div className={`mt-5 text-center text-xs ${isLight ? 'text-emerald-900/50' : 'text-emerald-200/40'}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface MenuButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  badge?: string;
  icon?: string;
  isLight?: boolean;
}

export function MenuButton({
  label,
  onClick,
  variant = 'primary',
  disabled = false,
  badge,
  icon,
  isLight: isLightProp,
}: MenuButtonProps) {
  const ctxLight = useLightMode();
  const isLight = isLightProp ?? ctxLight;
  const base =
    'group relative flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-bold tracking-wide transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40';

  const dark: Record<string, string> = {
    primary:
      'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/40 hover:from-emerald-500 hover:to-teal-500 hover:shadow-emerald-700/50 hover:scale-[1.02] active:scale-[0.98]',
    secondary:
      'border border-amber-500/40 bg-amber-950/40 text-amber-100 hover:border-amber-400/60 hover:bg-amber-900/50 hover:scale-[1.02] active:scale-[0.98]',
    danger:
      'border border-red-500/40 bg-red-950/40 text-red-100 hover:border-red-400/60 hover:bg-red-900/50 hover:scale-[1.02] active:scale-[0.98]',
    ghost:
      'border border-white/10 bg-white/5 text-emerald-100/80 hover:bg-white/10 hover:text-white hover:scale-[1.02] active:scale-[0.98]',
  };

  const light: Record<string, string> = {
    primary:
      'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-700/25 hover:from-emerald-500 hover:to-teal-500 hover:scale-[1.02] active:scale-[0.98]',
    secondary:
      'border border-amber-600/40 bg-amber-100/80 text-amber-900 hover:border-amber-600/60 hover:bg-amber-200/80 hover:scale-[1.02] active:scale-[0.98]',
    danger:
      'border border-red-600/40 bg-red-100/80 text-red-800 hover:border-red-600/60 hover:bg-red-200/80 hover:scale-[1.02] active:scale-[0.98]',
    ghost:
      'border border-emerald-900/15 bg-white/70 text-emerald-900 hover:bg-white/95 hover:scale-[1.02] active:scale-[0.98]',
  };

  const variants = isLight ? light : dark;

  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} ${variants[variant]}`}>
      {icon && <span className="text-lg">{icon}</span>}
      <span>{label}</span>
      {badge && (
        <span
          className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
            isLight ? 'bg-black/10 text-emerald-950/70' : 'bg-black/30 text-emerald-200/80'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/** Sun / moon theme switch */
export function ThemeToggle({
  isLight,
  onToggle,
}: {
  isLight: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold shadow-lg transition-all hover:scale-105 active:scale-95 ${
        isLight
          ? 'border-amber-600/30 bg-white/85 text-amber-800 hover:bg-white'
          : 'border-emerald-400/25 bg-black/50 text-emerald-100 hover:bg-black/70'
      }`}
    >
      <span className="text-base">{isLight ? '☀️' : '🌙'}</span>
      <span className="hidden sm:inline">{isLight ? 'Light' : 'Dark'}</span>
    </button>
  );
}
