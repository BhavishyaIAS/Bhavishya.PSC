/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  BRAND — change the name, logo and colours of the whole app in this one file.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  • Logo: replace /public/brand/logo.png (a square image; it is shown in a circle).
 *  • Colours: hex values. Every button, gradient, badge and chart uses them.
 *  • Commission cards: each commission (by slug) gets its own colour identity and
 *    optional emblem / cover photo. Drop images into /public/brand/commissions/
 *    and point to them here. Missing images fall back to a clean gradient.
 */

export const brand = {
  name: "Bhavishya",
  suffix: "PSCs",
  tagline: "Learn · Practice · Perform",
  subtitle: "State PSC Group 1 & Group 2 Preparation",
  description:
    "A structured preparation ecosystem for State Public Service Commission exams — syllabus, notes, previous-year questions and progress in one place.",
  logo: "/brand/logo.png",
  colors: {
    primary: "#d90d20", // strong brand red
    primaryDeep: "#a80716", // darker red for gradients / hover
    secondary: "#102c5a", // deep navy
    accent: "#1458c8", // royal blue
  },
};

export type CommissionTheme = {
  from: string;
  via: string;
  to: string;
  ink: string; // colour of text on white buttons inside the card
  emblem?: string; // e.g. "/brand/commissions/appsc-emblem.png"
  cover?: string; // e.g. "/brand/commissions/appsc-cover.jpg"
  monogram: string; // shown when there's no emblem image
};

export const commissionThemes: Record<string, CommissionTheme> = {
  appsc: {
    from: "#0a2f78",
    via: "#1458c8",
    to: "#3b82f6",
    ink: "#1249a8",
    cover: "/brand/commissions/appsc-cover.jpg",
    emblem: "/brand/commissions/appsc-emblem.png",
    monogram: "AP",
  },
  tgpsc: {
    from: "#8f0613",
    via: "#d90d20",
    to: "#ef4444",
    ink: "#c20a1c",
    cover: "/brand/commissions/tgpsc-cover.jpg",
    emblem: "/brand/commissions/tgpsc-emblem.png",
    monogram: "TG",
  },
};

/** "Choose your group" blocks: one colour identity per exam group (by slug). */
export const groupThemes: Record<string, { gradient: string; ink: string }> = {
  "group-1": {
    gradient: "linear-gradient(125deg, #0b2f6e 0%, #1458c8 55%, #3d86ea 100%)",
    ink: "#1249a8",
  },
  "group-2": {
    gradient: "linear-gradient(125deg, #a80716 0%, #e11d2e 50%, #6d4aa3 100%)",
    ink: "#c20a1c",
  },
};

const fallbackThemes: Omit<CommissionTheme, "monogram">[] = [
  { from: "#064e3b", via: "#0f766e", to: "#14b8a6", ink: "#0f766e" },
  { from: "#4c1d95", via: "#6d28d9", to: "#8b5cf6", ink: "#6d28d9" },
  { from: "#7c2d12", via: "#c2410c", to: "#f97316", ink: "#c2410c" },
];

export function groupTheme(slug: string, index = 0) {
  return groupThemes[slug] ?? Object.values(groupThemes)[index % Object.keys(groupThemes).length];
}

export function themeFor(slug: string, index = 0, shortName = ""): CommissionTheme {
  return (
    commissionThemes[slug] ?? {
      ...fallbackThemes[index % fallbackThemes.length],
      monogram: (shortName || slug).slice(0, 2).toUpperCase(),
    }
  );
}
