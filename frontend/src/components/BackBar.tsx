"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** How many pages this tab has moved through inside the site (since it was loaded). */
let moves = 0;

/** One level up: a page's parent, and an exam's home goes back to the home page. */
function parent(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "exams" && parts.length <= 3) return "/";
  parts.pop();
  return `/${parts.join("/")}`;
}

/** Pages without it: the home page, and the sign-in pages (their title sits inside the form's card). */
const WITHOUT = /^\/(login|signup)?$/;

/**
 * The "Back" button, on every page but those: at the right edge of the page, level with the page's title (on an
 * exam's pages, opposite "APPSC · Group 1"). Should a control already sit there, it rises just above the title.
 * Back goes to the page before when the student came from inside the site; otherwise one level up.
 */
export function BackBar() {
  const path = usePathname();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    moves += 1;
  }, [path]);

  useEffect(() => {
    const el = ref.current;
    const main = document.getElementById("main");
    if (!el || !main) return;
    const place = () => {
      const visible = (e: Element | null) => !!e && e.getBoundingClientRect().height > 0;
      const title =
        [document.querySelector(".ws-head h1"), ...Array.from(main.querySelectorAll("h1"))].find(
          (h) => visible(h) && !h?.closest(".back-bar"),
        ) ?? null;
      const page = (title?.closest(".page") ?? main.querySelector(".page")) as HTMLElement | null;
      if (!page) return;
      const m = main.getBoundingClientRect();
      const p = page.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const ps = getComputedStyle(page);
      const left = p.right - parseFloat(ps.paddingRight) - b.width - m.left;
      let top = title
        ? title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2 - b.height / 2 - m.top
        : p.top + parseFloat(ps.paddingTop) - m.top;
      // something already at the right of the title (an action button)? then just above the title instead
      const at = { left: left + m.left, right: left + m.left + b.width, top: top + m.top, bottom: top + m.top + b.height };
      const clash = Array.from(main.querySelectorAll("a, button, input, select, textarea")).some((c) => {
        if (el.contains(c)) return false;
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.left < at.right && r.right > at.left && r.top < at.bottom && r.bottom > at.top;
      });
      if (clash && title) top = Math.max(4, title.getBoundingClientRect().top - m.top - b.height - 10);
      el.style.left = `${Math.max(8, left)}px`;
      el.style.top = `${Math.max(4, top)}px`;
      el.style.visibility = "visible";
    };
    el.style.visibility = "hidden";
    place();
    const ro = new ResizeObserver(() => place());
    ro.observe(main);
    addEventListener("resize", place);
    document.fonts?.ready.then(place).catch(() => {});
    const later = window.setTimeout(place, 400);
    return () => {
      ro.disconnect();
      removeEventListener("resize", place);
      window.clearTimeout(later);
    };
  }, [path]);

  if (WITHOUT.test(path)) return null;
  const back = () => {
    let fromHere = moves > 1;
    if (!fromHere && document.referrer) {
      try {
        fromHere = new URL(document.referrer).origin === location.origin;
      } catch {
        fromHere = false;
      }
    }
    if (fromHere && history.length > 1) router.back();
    else router.push(parent(path));
  };
  return (
    <div ref={ref} className="back-bar">
      <button type="button" className="btn btn-ghost btn-sm back-btn" onClick={back}>
        <ArrowLeft size={15} aria-hidden /> Back
      </button>
    </div>
  );
}
