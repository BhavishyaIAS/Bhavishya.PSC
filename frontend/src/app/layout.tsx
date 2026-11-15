import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Source_Serif_4 } from "next/font/google";

import { brand } from "@/brand.config";
import { BottomNav } from "@/components/BottomNav";
import { Backdrop } from "@/components/fx/Backdrop";
import { Interactions } from "@/components/fx/Interactions";
import { MotionToggle } from "@/components/fx/MotionToggle";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/ui/Toast";
import { getCommissions } from "@/lib/catalog";
import { currentUser } from "@/lib/server-api";
import { getSite } from "@/lib/site";
import { cookies } from "next/headers";

import "./globals.css";
import "./design.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

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
    { media: "(prefers-color-scheme: light)", color: "#f3f6fc" },
    { media: "(prefers-color-scheme: dark)", color: "#090f1c" },
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
  const [user, site, commissions, jar] = await Promise.all([currentUser(), getSite(), getCommissions(), cookies()]);
  // The phone bar links to the exams of the commission being browsed (or the one the site is dedicated to).
  const browsing = jar.get("bp_commission")?.value;
  const current =
    commissions.find((c) => c.slug === site.focus) ?? commissions.find((c) => c.slug === browsing) ?? commissions[0];
  return (
    <html
      lang="en"
      className={`${inter.variable} ${display.variable} ${serif.variable}`}
      data-reader-size={site.reader_size}
      data-reader-font={site.reader_font}
      data-backdrops={site.backdrops ? undefined : "off"}
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
        {site.backdrops && <Backdrop />}
        <Interactions />
        <ToastProvider>
          <Header user={user} />
          <main id="main">{children}</main>
          <footer className="site-footer">
            <span>
              {brand.name} {brand.suffix} · {brand.tagline} · Structured preparation for State PSC exams
            </span>
            <MotionToggle />
          </footer>
          {user && <BottomNav exams={current?.tracks ?? []} isAdmin={user.role === "admin"} />}
        </ToastProvider>
      </body>
    </html>
  );
}
