"use client";

import { useEffect, useId, useState } from "react";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  mermaidReady ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict", // no HTML labels, no click handlers
      theme: document.documentElement.dataset.theme === "dark" ? "dark" : "neutral",
      fontFamily: "inherit",
    });
    return mermaid;
  });
  return mermaidReady;
}

/** A simple diagram written in Mermaid syntax (flowcharts, timelines, mind-maps…), rendered client-side. */
export function Diagram({ code, caption }: { code: string; caption?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!code.trim()) return;
    loadMermaid()
      .then((mermaid) => mermaid.render(`dg${id}${Date.now()}`, code))
      .then(({ svg }) => {
        if (!cancelled) {
          setSvg(svg);
          setError(false);
        }
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  return (
    <figure className="diagram">
      {error || !code.trim() ? (
        <pre>{code || "(empty diagram)"}</pre>
      ) : svg ? (
        // Mermaid output in strict mode is sanitised SVG (DOMPurify inside mermaid).
        <div role="img" aria-label={caption || "Diagram"} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="muted small">Rendering diagram…</div>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
