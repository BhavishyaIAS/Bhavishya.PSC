import { brand } from "@/brand.config";
import { CommissionCard } from "@/components/CommissionCard";
import { EmptyState } from "@/components/ui/bits";
import { getCommissions } from "@/lib/catalog";
import { currentUser } from "@/lib/server-api";

export default async function LandingPage() {
  const [commissions, user] = await Promise.all([getCommissions(), currentUser()]);
  const live = commissions.flatMap((c) => c.tracks.filter((t) => t.has_content).map((t) => t.label));
  return (
    <div className="landing-hero">
      <div className="page">
        <div className="hero-title">
          <div className="eyebrow">{user ? `Welcome back, ${user.display_name}` : "Your partner for State PSC exams"}</div>
          <h1>
            Choose Your <em>Exam</em>
          </h1>
          <div className="hero-points">
            <span>Structured Learning</span>
            <span>Quality Content</span>
            <span>Exam-Focused Practice</span>
          </div>
        </div>

        {commissions.length === 0 ? (
          <EmptyState title="No examinations yet">
            The exam catalogue couldn&apos;t be loaded. If you&apos;re running locally, make sure the API is up and seeded.
          </EmptyState>
        ) : (
          <div className={`commission-grid ${commissions.length === 1 ? "single" : ""}`}>
            {commissions.map((c, i) => (
              <CommissionCard key={c.slug} commission={c} index={i} />
            ))}
          </div>
        )}

        <p className="landing-foot">
          {live.length
            ? `Content is currently available for ${live.join(", ")}. Other tracks are ready for upload.`
            : brand.description}
        </p>
      </div>
    </div>
  );
}
