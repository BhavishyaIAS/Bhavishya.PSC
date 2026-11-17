import { brand } from "@/brand.config";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-art">
        {/* deep space shows through here */}
        <div className="auth-stage" data-stage aria-hidden />
        <div className="eyebrow">{brand.tagline}</div>
        <h2>
          From syllabus to self-assessment, <em>in one place.</em>
        </h2>
        <p>Every note and previous-year question is filed under the official syllabus, so nothing is loose.</p>
      </aside>
      <div className="auth-form">{children}</div>
    </div>
  );
}
