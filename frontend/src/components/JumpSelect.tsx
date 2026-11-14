"use client";

import { useRouter } from "next/navigation";

/** A labelled dropdown whose options are links: choosing one navigates there (topic / chapter pickers). */
export function JumpSelect({
  label,
  options,
  value,
  className = "",
}: {
  label: string;
  options: { href: string; label: string }[];
  value: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <label className={`jump-select ${className}`}>
      <span className="label">{label}</span>
      <select className="select" value={value} onChange={(e) => router.push(e.target.value)}>
        {options.map((o) => (
          <option key={o.href} value={o.href}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
