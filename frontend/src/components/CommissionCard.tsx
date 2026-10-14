import { BarChart3, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";

import { themeFor } from "@/brand.config";
import { hasPublicAsset } from "@/lib/assets";
import type { Commission } from "@/lib/types";

export function CommissionCard({ commission, index }: { commission: Commission; index: number }) {
  const theme = themeFor(commission.slug, index, commission.short_name);
  const cover = hasPublicAsset(theme.cover) ? theme.cover : undefined;
  const emblem = hasPublicAsset(theme.emblem) ? theme.emblem : undefined;
  return (
    <article className="commission-card" aria-labelledby={`c-${commission.slug}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cover && <img className="cover" src={cover} alt="" />}
      <div
        className="tint"
        style={{
          background: `linear-gradient(160deg, ${theme.from}f5 0%, ${theme.via}e0 50%, ${theme.to}cc 100%)`,
        }}
      />
      <div className="emblem">
        {emblem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emblem} alt={`${commission.short_name} emblem`} />
        ) : (
          <span className="monogram" style={{ color: theme.ink }} aria-hidden>
            {theme.monogram}
          </span>
        )}
      </div>
      <h2 id={`c-${commission.slug}`}>
        <Link href={`/exams/${commission.slug}`}>{commission.short_name}</Link>
      </h2>
      <div className="full-name">{commission.name}</div>
      <div className="group-buttons">
        {commission.tracks.map((t, i) => {
          const Icon = i === 0 ? FileText : BarChart3;
          return (
            <Link
              key={t.group}
              href={`/exams/${t.commission}/${t.group}`}
              className="group-button"
              style={{ color: theme.ink }}
              aria-label={`${commission.short_name} ${t.group_name}${t.has_content ? "" : " (content coming soon)"}`}
            >
              <Icon size={24} aria-hidden />
              <span>
                {t.group_name.replace(" ", " - ")}
                {!t.has_content && <span className="soon">Ready for upload</span>}
              </span>
              <ChevronRight className="chev" size={22} aria-hidden />
            </Link>
          );
        })}
      </div>
    </article>
  );
}
