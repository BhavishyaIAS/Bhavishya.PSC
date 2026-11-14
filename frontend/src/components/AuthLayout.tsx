import { brand } from "@/brand.config";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-art">
        {/* The 3D gateway is drawn here by the backdrop. */}
        <div className="auth-stage" data-stage aria-hidden />
        <div className="eyebrow">{brand.tagline}</div>
        <h2>From syllabus to self-assessment — without leaving one place.</h2>
        <p>Every note and previous-year question is filed under the official syllabus, so nothing is loose.</p>
      </aside>
      <div className="auth-form">{children}</div>
    </div>
  );
}
