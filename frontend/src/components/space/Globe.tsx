/**
 * A small shaded sphere standing for a world in navigation (tabs, lists, the phone bar).
 * Pure CSS: lit from the upper left like everything else here, Saturn with its ring.
 */
export function Globe({ world, size = 18 }: { world: string; size?: number }) {
  return <span className={`globe globe-${world}`} style={{ ["--g" as string]: `${size}px` }} aria-hidden />;
}
