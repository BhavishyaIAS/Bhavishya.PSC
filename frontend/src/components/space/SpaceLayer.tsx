"use client";

import dynamic from "next/dynamic";

// The renderer is fetched after the page is interactive; until then (and without WebGL) the poster shows.
const Universe = dynamic(() => import("./Universe"), { ssr: false });

/**
 * Everything behind the page, back to front:
 *   .space-poster  a still of the current world (CSS, instant; see worlds.css)
 *   canvas         the live world, faded in once its first frame is drawn
 *   .space-scrim   a veil that deepens as the reader scrolls into the content
 */
export function SpaceLayer({ live }: { live: boolean }) {
  return (
    <div className="space" aria-hidden>
      <div className="space-poster" />
      {live && <Universe />}
      <div className="space-scrim" />
    </div>
  );
}
