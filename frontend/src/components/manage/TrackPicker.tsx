"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Commission } from "@/lib/types";

/** Commission × group selector that lives in the URL (?track=appsc/group-1). */
export function TrackPicker({
  commissions,
  value,
  allowAll,
  label = "Exam track",
  onChange,
}: {
  commissions: Commission[];
  value: string;
  allowAll?: boolean;
  label?: string;
  onChange?: (v: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="field" style={{ minWidth: 220 }}>
      <span className="label">{label}</span>
      <select
        className="select"
        value={value}
        onChange={(e) => {
          if (onChange) return onChange(e.target.value);
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set("track", e.target.value);
          else next.delete("track");
          next.delete("page");
          router.push(`${pathname}?${next}`);
        }}
      >
        {allowAll && <option value="">All tracks</option>}
        {commissions.map((c) => (
          <optgroup key={c.slug} label={c.name}>
            {c.tracks.map((t) => (
              <option key={t.id} value={`${t.commission}/${t.group}`}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function findTrack(commissions: Commission[], key: string) {
  for (const c of commissions) for (const t of c.tracks) if (`${t.commission}/${t.group}` === key) return t;
  return undefined;
}
