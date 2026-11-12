"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Chapter dropdown for the notes reader (navigates on change; the side list offers the same links). */
export function ChapterPicker({ chapters, value }: { chapters: { id: number; label: string; count: number }[]; value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="chapter-picker">
      <span className="label">Chapter</span>
      <select
        className="select"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("topic", e.target.value);
          router.push(`${pathname}?${next}`);
        }}
      >
        {chapters.map((c, i) => (
          <option key={c.id} value={c.id}>
            {i + 1}. {c.label} {c.count ? `(${c.count})` : "(no notes yet)"}
          </option>
        ))}
      </select>
    </label>
  );
}
