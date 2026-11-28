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

/**
 * The "Back" button at the top right of every page but the home page: back to the page before, when the student
 * came from inside the site; otherwise (a link from outside, a reload) one level up.
 */
export function BackBar() {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    moves += 1;
  }, [path]);
  if (path === "/") return null;
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
    <div className="back-bar">
      <button type="button" className="btn btn-ghost btn-sm back-btn" onClick={back}>
        <ArrowLeft size={15} aria-hidden /> Back
      </button>
    </div>
  );
}
