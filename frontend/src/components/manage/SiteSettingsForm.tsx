"use client";

import { Landmark, Save, Star, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { brand } from "@/brand.config";
import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";
import type { NoteKindInfo, Site } from "@/lib/types";

import type { ExamsData } from "./ExamsManager";

const SIZES = ["Small", "Normal", "Large", "Largest"];

/** Site-wide choices: dedicate the platform to one exam, home-page wording, and how notes are presented. */
export function SiteSettingsForm({ site, exams }: { site: Site; exams: ExamsData }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const [eyebrow, setEyebrow] = useState(site.hero_eyebrow);
  const [lead, setLead] = useState(site.hero_lead);
  const [kinds, setKinds] = useState<NoteKindInfo[]>(site.note_kinds);
  const [font, setFont] = useState(site.reader_font);
  const [size, setSize] = useState(site.reader_size);
  const [codes, setCodes] = useState(site.show_codes);
  const [contents, setContents] = useState(site.show_contents);
  const [backdrops, setBackdrops] = useState(site.backdrops);
  const focused = exams.results.find((b) => b.id === exams.focus);
  const upsc = exams.results.find((b) => b.slug === "upsc");
  const [target, setTarget] = useState(String(upsc?.id ?? exams.results[0]?.id ?? ""));

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done, "success");
      start(() => router.refresh());
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  const dedicate = (commission: number | null) => clientApi("/manage/site/dedicate/", { method: "POST", json: { commission } });
  const setKind = (key: string, patch: Partial<NoteKindInfo>) => setKinds((ks) => ks.map((k) => (k.key === key ? { ...k, ...patch } : k)));
  const enabled = kinds.filter((k) => k.enabled).length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Site settings</div>
          <h1>How the platform presents itself</h1>
          <p>Everything here applies to the whole site and can be changed back at any time.</p>
        </div>
      </div>

      <section className="panel" aria-labelledby="focus-h">
        <div className="panel-head">
          <h2 id="focus-h">
            <Star size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> Dedicate the platform to one exam
          </h2>
        </div>
        {focused ? (
          <>
            <div className="alert alert-success" style={{ marginBottom: 14 }}>
              The platform is dedicated to <b>{focused.name}</b>. Students see only {focused.short_name}; the home page opens straight on its
              exams, and every other commission is hidden.
            </div>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => dedicate(null), "All exams are shown again")}>
              <Undo2 size={17} aria-hidden /> Show all exams again
            </button>
            <p className="hint" style={{ marginBottom: 0 }}>
              The commissions that were visible before come back; {focused.short_name} stays visible too. Nothing is deleted either way.
            </p>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Turn the whole site into a single-exam platform — for example a UPSC-only site. Students then see only that exam, the home
              page opens straight on it, and the other commissions are hidden (not deleted) until you switch back.
            </p>
            <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
              {!upsc && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const made = await clientApi<{ id: number }>("/manage/site/starter/", { method: "POST", json: { kind: "upsc" } });
                      await dedicate(made.id);
                    }, "The platform is now dedicated to UPSC")
                  }
                >
                  <Landmark size={17} aria-hidden /> Set up UPSC and dedicate the platform to it
                </button>
              )}
              {exams.results.length > 0 && (
                <>
                  <label className="field" style={{ minWidth: 240 }}>
                    <span className="label">{upsc ? "Exam" : "Or choose an existing exam"}</span>
                    <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                      {exams.results.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.short_name} — {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className={`btn ${upsc ? "btn-primary" : "btn-secondary"}`} disabled={busy || !target} onClick={() => run(() => dedicate(Number(target)), "Done — the platform is dedicated to that exam")}>
                    <Star size={17} aria-hidden /> Dedicate the platform to it
                  </button>
                </>
              )}
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>
              “Set up UPSC” creates UPSC → Civil Services with 14 General Studies topics, ready for your notes. Add or change exams any time in{" "}
              <Link className="link" href="/manage/exams">
                Exams
              </Link>
              .
            </p>
          </>
        )}
      </section>

      <form
        className="stack"
        style={{ gap: 18 }}
        onSubmit={(e) => {
          e.preventDefault();
          const note_kinds = Object.fromEntries(kinds.map((k) => [k.key, { label: k.label, blurb: k.blurb, enabled: k.enabled }]));
          void run(
            () => clientApi("/manage/site/", { method: "PATCH", json: { hero_eyebrow: eyebrow, hero_lead: lead, note_kinds, reader_font: font, reader_size: size, show_codes: codes, show_contents: contents, backdrops } }),
            "Settings saved",
          );
        }}
      >
        <section className="panel" aria-labelledby="home-h">
          <div className="panel-head">
            <h2 id="home-h">Home page wording</h2>
            <span className="muted small">Leave a box empty to use the standard wording.</span>
          </div>
          <div className="form-grid">
            <label className="field full">
              <span className="label">Small line above “{brand.heroTitle}”</span>
              <input className="input" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} maxLength={160} placeholder={focused ? focused.name : brand.subtitle} />
            </label>
            <label className="field full">
              <span className="label">Sentence under the tagline</span>
              <textarea className="textarea" rows={2} value={lead} onChange={(e) => setLead(e.target.value)} maxLength={320} placeholder="Syllabus, notes, previous-year questions and your progress — in one calm place built for long hours of study." />
            </label>
          </div>
        </section>

        <section className="panel" aria-labelledby="kinds-h">
          <div className="panel-head">
            <h2 id="kinds-h">Types of notes</h2>
            <span className="muted small">Rename them, or switch off the ones you don&apos;t offer. With only one switched on, learners go straight to reading.</span>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            {kinds.map((k) => (
              <div key={k.key} className="kind-row">
                <label className="checkbox" title={k.enabled && enabled === 1 ? "At least one type must stay on" : undefined}>
                  <input type="checkbox" checked={k.enabled} disabled={k.enabled && enabled === 1} onChange={(e) => setKind(k.key, { enabled: e.target.checked })} /> Offer it
                </label>
                <label className="field">
                  <span className="label">Name</span>
                  <input className="input" value={k.label} onChange={(e) => setKind(k.key, { label: e.target.value })} maxLength={40} disabled={!k.enabled} />
                </label>
                <label className="field" style={{ flex: 2 }}>
                  <span className="label">Description</span>
                  <input className="input" value={k.blurb} onChange={(e) => setKind(k.key, { blurb: e.target.value })} maxLength={140} disabled={!k.enabled} />
                </label>
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            Switching a type off hides it from learners; the notes already written in it are kept.
          </p>
        </section>

        <section className="panel" aria-labelledby="read-h">
          <div className="panel-head">
            <h2 id="read-h">How notes are presented</h2>
            <span className="muted small">Starting point for every reader; each reader can still adjust text size and font for themselves.</span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="label">Font for notes</span>
              <select className="select" value={font} onChange={(e) => setFont(e.target.value as Site["reader_font"])}>
                <option value="sans">Clean (sans-serif)</option>
                <option value="serif">Book-style (serif)</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Text size</span>
              <select className="select" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {SIZES.map((s, i) => (
                  <option key={s} value={i + 1}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={contents} onChange={(e) => setContents(e.target.checked)} /> Show a “Contents” box at the top of each chapter
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={codes} onChange={(e) => setCodes(e.target.checked)} /> Show section codes (like MIH-01-01) to students
            </label>
            <label className="checkbox full">
              <input type="checkbox" checked={backdrops} onChange={(e) => setBackdrops(e.target.checked)} /> Show the 3D backgrounds behind pages
            </label>
          </div>
        </section>

        <div className="row">
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            <Save size={18} aria-hidden /> Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
