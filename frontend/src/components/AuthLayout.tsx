import { brand } from "@/brand.config";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-art" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/hero-amaravati-buddha.jpg" alt="" />
        <div className="eyebrow" style={{ color: "#fde3e6" }}>
          {brand.tagline}
        </div>
        <h2 style={{ marginTop: 10 }}>From syllabus to self-assessment — without leaving one place.</h2>
        <p>Every note, video and previous-year question is mapped to the official syllabus, so nothing is loose.</p>
      </aside>
      <div className="auth-form">{children}</div>
    </div>
  );
}
