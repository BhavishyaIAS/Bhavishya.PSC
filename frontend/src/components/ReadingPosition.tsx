"use client";

import { Bookmark, CornerDownRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { clientApi } from "@/lib/client-api";

/** How far down the notes (0 to 1): the top of the screen against the length of the reading. */
function measure(el: HTMLElement) {
  const top = el.getBoundingClientRect().top + window.scrollY;
  const span = el.offsetHeight - window.innerHeight * 0.6;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (window.scrollY - top + window.innerHeight * 0.2) / span));
}

function scrollTo(el: HTMLElement, pos: number) {
  const top = el.getBoundingClientRect().top + window.scrollY;
  const span = el.offsetHeight - window.innerHeight * 0.6;
  window.scrollTo({ top: Math.max(0, top + pos * span - window.innerHeight * 0.2) });
}

/**
 * Remembers how far down a topic's notes the student read, so "Continue" on the dashboard opens it there.
 * Opened with ?resume=1 it goes straight back to that place; otherwise it offers to.
 */
export function ReadingPosition({
  base,
  code,
  kind,
  initial,
  resume,
}: {
  base: string;
  code: string;
  kind: string;
  initial: number;
  resume: boolean;
}) {
  const [offer, setOffer] = useState(!resume && initial > 0.05 && initial < 0.97);
  const sent = useRef(initial);
  const target = () => document.querySelector<HTMLElement>(".topic-read .reading");

  useEffect(() => {
    const el = target();
    if (!el) return;
    if (resume && initial > 0.02) scrollTo(el, initial);
    const url = `${base}/micro-themes/${encodeURIComponent(code)}/position/`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      const pos = Math.round(measure(el) * 1000) / 1000;
      // small movements are not worth a request; reaching the end always is
      if (Math.abs(pos - sent.current) < 0.02 && pos < 1) return;
      sent.current = pos;
      clientApi(url, { method: "PUT", json: { position: pos, kind }, keepalive: true }).catch(() => {});
    };
    const onScroll = () => {
      if (window.scrollY > 200) setOffer(false);
      clearTimeout(timer);
      timer = setTimeout(save, 1200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
    };
  }, [base, code, kind, initial, resume]);

  if (!offer) return null;
  return (
    <button
      type="button"
      className="mini-btn resume-btn"
      onClick={() => {
        const el = target();
        if (el) scrollTo(el, initial);
        setOffer(false);
      }}
    >
      <CornerDownRight size={14} aria-hidden /> Resume at {Math.round(initial * 100)}%
    </button>
  );
}

/** Keep a topic (its notes) to come back to; the dashboard lists kept topics. */
export function KeepTopic({ base, code, initial }: { base: string; code: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`mini-btn bookmark-btn ${on ? "is-on" : ""}`}
      aria-pressed={on}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await clientApi(`${base}/micro-themes/${encodeURIComponent(code)}/keep/`, { method: on ? "DELETE" : "POST" });
          setOn(!on);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Bookmark size={14} aria-hidden fill={on ? "currentColor" : "none"} /> {on ? "Kept" : "Keep topic"}
    </button>
  );
}
