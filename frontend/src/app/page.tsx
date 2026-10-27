import { brand } from "@/brand.config";
import { CommissionCard } from "@/components/CommissionCard";
import { EmptyState } from "@/components/ui/bits";
import { getCommissions } from "@/lib/catalog";

export default async function LandingPage() {
  const commissions = await getCommissions();
  const live = commissions.flatMap((c) => c.tracks.filter((t) => t.has_content).map((t) => t.label));
  return (
    <div className="landing-hero">
      <div className="page">
        <div className="hero-brand">
          <h1>{brand.heroTitle}</h1>
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
