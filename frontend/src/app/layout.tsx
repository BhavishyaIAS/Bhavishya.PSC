import type { Metadata, Viewport } from "next";
import {
  Cinzel,
  Cormorant_Garamond,
  Figtree,
  Fraunces,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Condensed,
  Literata,
  Manrope,
  Noto_Sans_Devanagari,
  Noto_Sans_Telugu,
  Space_Grotesk,
  Syncopate,
} from "next/font/google";

import { brand } from "@/brand.config";
import { BottomNav } from "@/components/BottomNav";
import { Interactions } from "@/components/fx/Interactions";
import { MotionToggle } from "@/components/fx/MotionToggle";
import { Header } from "@/components/Header";
import { SkyBackdrop } from "@/components/sky/SkyBackdrop";
import { SpaceLayer } from "@/components/space/SpaceLayer";
import { worldForPath } from "@/components/space/worlds";
import { ToastProvider } from "@/components/ui/Toast";
import { getCommissions } from "@/lib/catalog";
import { currentUser } from "@/lib/server-api";
import { getSite } from "@/lib/site";
import { cookies, headers } from "next/headers";

import "./globals.css";
import "./design.css";
import "./worlds.css";
import "./sky.css";

/*
 * Type. Each world has its own voice (see worlds.css); these are the faces they draw on.
 * Only Geist is preloaded: every other face is fetched when a page first uses it.
 *
 *   everywhere   Geist (interface), Geist Mono (labels), Literata (the book face for long notes)
 *   deep space   Syncopate: wide, quiet capitals, with Fraunces italic beside them
 *   Mars         IBM Plex Sans / Condensed / Mono: the voice of technical documents
 *   the Moon     Geist and Geist Mono alone: precise, engineered
 *   Saturn       Cormorant Garamond: editorial, contemplative
 *   Jupiter      Space Grotesk: structured, a little scientific
 *   Earth        Manrope: modern, analytical, with clear numerals
 *
 * latin-ext brings ā ī ṇ ś (transliteration) and ₹; the two Noto faces load only on pages
 * that contain Telugu or Devanagari.
 */
const sans = Geist({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-mono-face" });
const serif = Literata({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, style: ["normal", "italic"], axes: ["opsz"], variable: "--font-serif" });
const display = Fraunces({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, style: ["normal", "italic"], axes: ["opsz"], variable: "--font-display-serif" });
const wide = Syncopate({ subsets: ["latin"], weight: ["400", "700"], display: "swap", preload: false, variable: "--font-wide" });
const plex = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-plex" });
const plexCondensed = IBM_Plex_Sans_Condensed({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["500", "600"], variable: "--font-plex-condensed" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "500"], variable: "--font-plex-mono" });
const cormorant = Cormorant_Garamond({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-cormorant" });
const grotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-grotesk" });
// the Sky style (Manage → Site settings): Cinzel capitals for titles, Figtree for everything else
const cinzel = Cinzel({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["500", "700"], variable: "--font-cinzel" });
const figtree = Figtree({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "500", "600", "700"], variable: "--font-figtree" });
const manrope = Manrope({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, variable: "--font-manrope" });
const telugu = Noto_Sans_Telugu({ subsets: ["telugu"], variable: "--font-telugu", display: "swap", preload: false });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-devanagari", display: "swap", preload: false });
const fonts = [sans, mono, serif, display, wide, plex, plexCondensed, plexMono, cormorant, grotesk, manrope, cinzel, figtree, telugu, devanagari].map((f) => f.variable).join(" ");

// Allow time for a sleeping API to wake (Render's free plan takes up to a minute).
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  // When the platform is dedicated to one exam, the browser title says so.
  const subtitle = site.hero_eyebrow || (site.focus_name ? `${site.focus_name} Preparation` : brand.subtitle);
  return {
    title: { default: `${brand.name} ${brand.suffix} — ${subtitle}`, template: `%s · ${brand.name} ${brand.suffix}` },
    description: brand.description,
    icons: { icon: "/brand/favicon.png", apple: "/brand/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  // The browser's own toolbar matches the (monochrome) top bar.
  themeColor: [
    // the browser's own bar is the colour of space
    { media: "(prefers-color-scheme: light)", color: "#05060c" },
    { media: "(prefers-color-scheme: dark)", color: "#05060c" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Brand colours → CSS custom properties (the single source is brand.config.ts).
const brandCss = `:root{--brand-primary:${brand.colors.primary};--brand-primary-deep:${brand.colors.primaryDeep};--brand-secondary:${brand.colors.secondary};--brand-accent:${brand.colors.accent};}`;

// Runs before paint so there's no flash: theme (saved choice, else the OS setting),
// the animations switch, and the reader's own text size / font (over the site's defaults).
const themeScript = `(function(){try{var d=document.documentElement,s=localStorage,t=s.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;if(s.getItem('motion')==='off')d.dataset.motion='off';var z=s.getItem('reader-size');if(z)d.setAttribute('data-reader-size',z);var f=s.getItem('reader-font');if(f)d.setAttribute('data-reader-font',f)}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, site, commissions, jar, head] = await Promise.all([currentUser(), getSite(), getCommissions(), cookies(), headers()]);
  // Which world this page is in, known on the server (the proxy passes the path), so the first paint is already there.
  const world = worldForPath(head.get("x-bp-path") ?? "/");
  // The Sky style replaces the worlds: no world, no 3D scenes, a star field instead (switch back in Site settings).
  const sky = site.skin === "sky";
  // The phone bar links to the exams of the commission being browsed (or the one the site is dedicated to).
  const browsing = jar.get("bp_commission")?.value;
  const current =
    commissions.find((c) => c.slug === site.focus) ?? commissions.find((c) => c.slug === browsing) ?? commissions[0];
  return (
    <html
      lang="en"
      className={fonts}
      data-reader-size={site.reader_size}
      data-reader-font={site.reader_font}
      data-backdrops={site.backdrops ? undefined : "off"}
      data-world={sky ? undefined : world}
      data-skin={sky ? "sky" : undefined}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {sky ? <SkyBackdrop /> : <SpaceLayer live={site.backdrops} />}
        <Interactions />
        <ToastProvider>
          <Header sky={sky} user={user} exams={site.focus ? commissions.filter((c) => c.slug === site.focus) : commissions} />
          <main id="main">{children}</main>
          <footer className="site-footer">
            <span>
              {brand.name} {brand.suffix} · {brand.tagline}
            </span>
            <MotionToggle />
          </footer>
          {user && <BottomNav exams={current?.tracks ?? []} isAdmin={user.role === "admin"} />}
        </ToastProvider>
      </body>
    </html>
  );
}
