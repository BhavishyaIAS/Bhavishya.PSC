/**
 * The Living Universe's marks: quiet line drawings in place of the cosmic portals. Each breathes (CSS), slowly.
 * Proportions follow the golden ratio (the rings of a ripple, the branching of the tree), never shown as such.
 */
export type EmblemKind = "leaf" | "drop" | "tree" | "nest" | "lotus" | "sunrise" | "ripple";

const PATHS: Record<EmblemKind, React.ReactNode> = {
  ripple: (
    <>
      <circle cx="50" cy="50" r="38" />
      <circle cx="50" cy="50" r="23.5" opacity=".75" />
      <circle cx="50" cy="50" r="14.5" opacity=".55" />
      <circle cx="50" cy="50" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  leaf: (
    <>
      <path d="M50 88 C50 70 50 52 50 20" />
      <path d="M50 20 C78 30 84 62 50 82 C16 62 22 30 50 20 Z" />
      <path d="M50 40 L64 32 M50 52 L68 44 M50 64 L64 58 M50 40 L36 32 M50 52 L32 44 M50 64 L36 58" opacity=".6" />
    </>
  ),
  drop: (
    <>
      <path d="M50 14 C62 34 74 48 74 62 A24 24 0 0 1 26 62 C26 48 38 34 50 14 Z" />
      <ellipse cx="50" cy="66" rx="12" ry="3.6" opacity=".6" />
      <ellipse cx="50" cy="66" rx="20" ry="6" opacity=".35" />
      <path d="M38 52 C38 46 42 40 45 36" opacity=".7" />
    </>
  ),
  tree: (
    <>
      <path d="M50 88 L50 56" strokeWidth="3" />
      <path d="M50 56 L32 38 M50 56 L68 38 M50 66 L38 52 M50 64 L62 50" />
      <path d="M32 38 L22 26 M32 38 L36 22 M68 38 L64 22 M68 38 L78 26 M50 56 L50 30 M50 30 L44 18 M50 30 L56 18" opacity=".8" />
      <path d="M30 88 L70 88" opacity=".5" />
    </>
  ),
  nest: (
    <>
      <path d="M22 54 C26 76 74 76 78 54" />
      <path d="M26 58 C34 70 66 70 74 58 M24 54 C40 62 60 62 76 54" opacity=".7" />
      <path d="M30 64 L40 58 M46 68 L56 60 M60 66 L70 58" opacity=".5" />
      <ellipse cx="44" cy="51" rx="6" ry="7.5" />
      <ellipse cx="57" cy="52" rx="5.5" ry="7" opacity=".8" />
    </>
  ),
  lotus: (
    <>
      <path d="M50 72 C40 60 40 40 50 24 C60 40 60 60 50 72 Z" />
      <path d="M50 72 C34 68 24 54 22 40 C36 44 46 54 50 72 Z" opacity=".85" />
      <path d="M50 72 C66 68 76 54 78 40 C64 44 54 54 50 72 Z" opacity=".85" />
      <path d="M50 72 C30 74 16 66 10 58 C26 56 40 62 50 72 Z M50 72 C70 74 84 66 90 58 C74 56 60 62 50 72 Z" opacity=".55" />
      <path d="M24 82 C40 78 60 78 76 82" opacity=".5" />
    </>
  ),
  sunrise: (
    <>
      <path d="M26 64 A24 24 0 0 1 74 64" />
      <path d="M14 64 L86 64" />
      <path d="M50 30 L50 22 M30 38 L25 32 M70 38 L75 32 M20 54 L13 52 M80 54 L87 52" opacity=".7" />
      <path d="M26 74 L74 74 M36 82 L64 82" opacity=".45" />
    </>
  ),
};

export function Emblem({ kind, size, className }: { kind: EmblemKind; size: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`living-emblem living-emblem-${kind} ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="50" cy="50" r="48" className="living-emblem-halo" stroke="none" />
      {PATHS[kind]}
    </svg>
  );
}

export const MODULE_EMBLEMS: Record<string, EmblemKind> = { materials: "leaf", prelims: "drop", mains: "tree", progress: "nest" };

export function examEmblem(slug: string): EmblemKind {
  return slug === "upsc" ? "lotus" : slug === "appsc" ? "sunrise" : "ripple";
}
