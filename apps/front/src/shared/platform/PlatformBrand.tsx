import type { ReactNode } from "react";

/**
 * Marca de la plataforma Trama (separada del Brand de cada tienda). Monograma "T" tejido: la barra
 * son dos hebras paralelas y el pie pasa por debajo de la superior y por encima de la inferior.
 * Misma geometría que scripts/generate-pwa-icons.mjs (íconos de la PWA).
 */

export const PLATFORM_NAME = "Trama";
export const PLATFORM_TAGLINE = "Tu tienda de moda, lista en minutos.";

type Tone = "light" | "dark";

const TONES: Record<Tone, { bar: string; stem: string; gap: string }> = {
  light: { bar: "#4F46E5", stem: "#3730A3", gap: "#F7F6FB" },
  dark: { bar: "#FFFFFF", stem: "#C9C6F7", gap: "#14142B" },
};

export function PlatformMark({ tone = "light", size = 40, title = PLATFORM_NAME }: { tone?: Tone; size?: number; title?: string }) {
  const color = TONES[tone];
  return (
    <svg className="platform-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <rect x="8" y="27" width="48" height="9" rx="4.5" fill={color.bar} opacity="0.92" />
      <rect x="25" y="13" width="14" height="43" rx="5" fill={color.stem} stroke={color.gap} strokeWidth="2.5" />
      <rect x="8" y="13" width="48" height="10" rx="5" fill={color.bar} stroke={color.gap} strokeWidth="2.5" />
    </svg>
  );
}

export function PlatformBrand({ variant = "lockup", tone = "light", showTagline = false }: { variant?: "mark" | "lockup"; tone?: Tone; showTagline?: boolean }) {
  if (variant === "mark") return <span className="platform-brand"><PlatformMark tone={tone} /></span>;
  return (
    <span className={`platform-brand lockup ${tone}`}>
      <PlatformMark tone={tone} size={34} />
      <span className="platform-brand-text">
        <span className="platform-wordmark">{PLATFORM_NAME}</span>
        {showTagline ? <span className="platform-tagline">{PLATFORM_TAGLINE}</span> : null}
      </span>
    </span>
  );
}

/** Motivo vectorial de tejido (urdimbre y trama entrelazadas) para fondos de la plataforma. */
export function WeaveMotif({ className }: { className?: string }) {
  return (
    <svg className={["weave-motif", className].filter(Boolean).join(" ")} viewBox="0 0 480 480" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="trama-weave" width="48" height="48" patternUnits="userSpaceOnUse">
          <rect width="48" height="48" fill="var(--weave-bg, #3730A3)" />
          <rect x="2" y="4" width="20" height="16" rx="3" fill="var(--weave-a, #4F46E5)" />
          <rect x="26" y="28" width="20" height="16" rx="3" fill="var(--weave-a, #4F46E5)" />
          <rect x="28" y="2" width="16" height="20" rx="3" fill="var(--weave-b, #6366F1)" />
          <rect x="4" y="26" width="16" height="20" rx="3" fill="var(--weave-b, #6366F1)" />
          <path d="M6 12h12M30 36h12M36 6v12M12 30v12" stroke="rgba(255,255,255,.22)" strokeWidth="1.5" strokeLinecap="round" />
        </pattern>
      </defs>
      <rect width="480" height="480" fill="url(#trama-weave)" />
    </svg>
  );
}

/** Contenedor con los tokens de la plataforma (selectores compuestos en platform.css). */
export function PlatformTheme({ children, className }: { children: ReactNode; className?: string }) {
  return <div data-platform="trama" className={["platform-theme", className].filter(Boolean).join(" ")}>{children}</div>;
}
