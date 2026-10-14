import { ArrowRight, BarChart3, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { groupTheme } from "@/brand.config";
import { ProgressBar } from "@/components/ui/bits";
import { trackPath } from "@/lib/format";
import { load, requireUser } from "@/lib/server-api";
import type { Coverage } from "@/lib/types";

export const metadata: Metadata = { title: "Progress Tracker" };

export default async function GlobalProgressPage() {
  const user = await requireUser("/progress");
  const { results } = await load<{ results: Coverage[] }>("/coverage/");
  const isAdmin = user.role === "admin";
  const live = results.filter((r) => r.has_content);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Performance</div>
          <h1>Progress Tracker</h1>
          <p>Your preparation across every exam track — content available, what you&apos;ve studied, and PYQs to practise.</p>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        {results.map((r, i) => (
          <Link
            key={r.track.id}
            href={trackPath(r.track.commission, r.track.group, "progress")}
            className="stat card-link track-tile"
            style={{ ["--tile" as string]: groupTheme(r.track.group, i).gradient }}
          >
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b style={{ color: "var(--text-strong)" }}>{r.track.label}</b>
              <ArrowRight size={16} aria-hidden />
            </div>
            {r.has_content ? (
              <>
                <div className="stat-value">{r.studied_pct}%</div>
                <div className="stat-label">
                  studied · {r.studied_micro_themes}/{r.micro_themes} micro-themes
                </div>
                <ProgressBar value={r.studied_pct} label={`${r.track.label} studied`} />
              </>
            ) : (
              <>
                <div className="stat-value muted">—</div>
                <div className="stat-label">{isAdmin ? "Empty — ready for upload" : "Content coming soon"}</div>
              </>
            )}
          </Link>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>
            <BarChart3 size={19} aria-hidden style={{ verticalAlign: "-3px" }} /> Unified preparation overview
          </h2>
          <span className="muted small">{live.length} of {results.length} tracks have content</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Examination</th>
                <th scope="col">Syllabus coverage</th>
                <th scope="col">Your progress</th>
                <th scope="col" className="num">Micro-themes</th>
                <th scope="col" className="num">Prelims PYQs</th>
                <th scope="col" className="num">Mains PYQs</th>
                <th scope="col" className="num">Files</th>
                <th scope="col"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.track.id}>
                  <td>
                    <b>{r.track.label}</b>
                  </td>
                  <td className="table-progress">
                    {r.has_content ? (
                      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <span style={{ flex: 1 }}>
                          <ProgressBar value={r.coverage_pct} thin label={`${r.track.label} coverage`} />
                        </span>
                        <b className="small">{r.coverage_pct}%</b>
                      </div>
                    ) : (
                      <span className="badge badge-neutral">No content yet</span>
                    )}
                  </td>
                  <td className="table-progress">
                    {r.has_content && (
                      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <span style={{ flex: 1 }}>
                          <ProgressBar value={r.studied_pct} thin label={`${r.track.label} studied`} />
                        </span>
                        <b className="small">{r.studied_pct}%</b>
                      </div>
                    )}
                  </td>
                  <td className="num">{r.micro_themes}</td>
                  <td className="num">{r.prelims_questions}</td>
                  <td className="num">{r.mains_questions}</td>
                  <td className="num">{r.materials}</td>
                  <td>
                    {r.has_content ? (
                      <Link className="link small" href={trackPath(r.track.commission, r.track.group, "progress")}>
                        Open
                      </Link>
                    ) : (
                      isAdmin && (
                        <Link className="link small row" style={{ gap: 4 }} href={`/manage/syllabus?track=${r.track.commission}/${r.track.group}`}>
                          <Upload size={13} aria-hidden /> Add
                        </Link>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
