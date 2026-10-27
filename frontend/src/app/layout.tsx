import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import { brand } from "@/brand.config";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/ui/Toast";
import { currentUser } from "@/lib/server-api";
import { cookies } from "next/headers";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

// Allow time for a sleeping API to wake (Render's free plan takes up to a minute).
export const maxDuration = 60;

export const metadata: Metadata = {
  title: { default: `${brand.name} ${brand.suffix} — ${brand.subtitle}`, template: `%s · ${brand.name} ${brand.suffix}` },
  description: brand.description,
  icons: { icon: "/brand/favicon.png", apple: "/brand/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  // The browser's own toolbar matches the (monochrome) top bar.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Brand colours → CSS custom properties (the single source is brand.config.ts).
const brandCss = `:root{--brand-primary:${brand.colors.primary};--brand-primary-deep:${brand.colors.primaryDeep};--brand-secondary:${brand.colors.secondary};--brand-accent:${brand.colors.accent};}`;

// Runs before paint so there's no light/dark flash. Respects a saved choice, else the OS setting.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const commission = (await cookies()).get("bp_commission")?.value ?? "appsc";
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ToastProvider>
          <Header user={user} commission={commission} />
          <main id="main">{children}</main>
          <footer className="site-footer">
            {brand.name} {brand.suffix} · {brand.tagline} · Structured preparation for State PSC exams
          </footer>
          {user && <BottomNav commission={commission} isAdmin={user.role === "admin"} />}
        </ToastProvider>
      </body>
    </html>
  );
}
