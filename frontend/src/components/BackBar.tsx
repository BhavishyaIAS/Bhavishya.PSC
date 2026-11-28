"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** How many pages this tab has moved through inside the site (since it was loaded). */
let moves = 0;

/** One level up: a page's parent, and an exam's home goes back to the home page. */
function parent(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "exams" && parts.length <= 3) return "/";
  parts.pop();
  return `/${parts.join("/")}`;
}

/** The "Back" button: back to the page before when the student came from inside the site, else one level up. */
export function BackButton({ className = "" }: { className?: string }) {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    moves += 1;
  }, [path]);
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
    <button type="button" className={`btn btn-ghost btn-sm back-btn ${className}`} onClick={back}>
      <ArrowLeft size={15} aria-hidden /> Back
    </button>
  );
}

/**
 * The Back button at the top right of the pages that have no head of their own for it: not the home page, and not
 * an exam's pages (theirs sits opposite the exam's name, see the exam layout).
 */
export function BackBar() {
  const path = usePathname();
  if (path === "/" || /^\/exams\/[^/]+\/[^/]+/.test(path)) return null;
  return (
    <div className="back-bar">
      <BackButton />
    </div>
  );
}
