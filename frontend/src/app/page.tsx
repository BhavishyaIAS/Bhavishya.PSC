import { brand } from "@/brand.config";
import { CommissionCard } from "@/components/CommissionCard";
import { EmptyState } from "@/components/ui/bits";
import { getCommissions } from "@/lib/catalog";

export default async function LandingPage() {
  const commissions = await getCommissions();
  const words = brand.heroTitle.split(" ");
  const live = commissions.flatMap((c) => c.tracks.filter((t) => t.has_content).map((t) => t.label));
  return (
    <div className="landing-hero">
      <div className="page">
        <div className="hero-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo} alt="" className="hero-logo" width={116} height={116} />
          <h1>
            {words.slice(0, -1).join(" ")} <em>{words[words.length - 1]}</em>
          </h1>
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
