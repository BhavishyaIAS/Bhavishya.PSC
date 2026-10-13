"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { clientApi, ClientApiError } from "@/lib/client-api";

function safeNext(next: string | null) {
  // Only allow same-site relative paths (no open redirect).
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      await clientApi(`/auth/${mode}/`, { method: "POST", json: Object.fromEntries(form) });
      router.replace(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError && err.body) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.body)) if (Array.isArray(v)) fe[k] = v.join(" ");
        setFieldErrors(fe);
        setError(typeof err.body.detail === "string" ? err.body.detail : Object.keys(fe).length ? "" : err.message);
      } else {
        setError("Couldn't reach the server. Please try again.");
      }
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <div className="auth-card">
      <div className="eyebrow">{isLogin ? "Welcome back" : "Start preparing"}</div>
      <h1 style={{ marginTop: 6 }}>{isLogin ? "Log in to continue" : "Create your free account"}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {isLogin ? "Pick up where you left off — your progress is saved." : "Access syllabus-mapped notes, PYQs and progress tracking."}
      </p>
      <form onSubmit={onSubmit} className="stack" style={{ marginTop: 22 }} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {!isLogin && (
          <div className="field">
            <label htmlFor="display_name">Your name</label>
            <input className="input" id="display_name" name="display_name" autoComplete="name" />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fieldErrors.email} />
          {fieldErrors.email && <span className="error">{fieldErrors.email}</span>}
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={isLogin ? undefined : 8}
            aria-invalid={!!fieldErrors.password}
          />
          {fieldErrors.password ? (
            <span className="error">{fieldErrors.password}</span>
          ) : (
            !isLogin && <span className="hint">At least 8 characters; avoid common passwords.</span>
          )}
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}
        </button>
      </form>
      <p className="muted small" style={{ marginTop: 18 }}>
        {isLogin ? "New here? " : "Already have an account? "}
        <Link className="link" href={`/${isLogin ? "signup" : "login"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>
          {isLogin ? "Create an account" : "Log in"}
        </Link>
      </p>
      {isLogin && process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS !== "false" && (
        <div className="demo-creds">
          <b>Demo accounts</b> (from the seed data)
          <br />
          Admin: <code>admin@bhavishya.app</code> / <code>Admin@2026</code>
          <br />
          Student: <code>student@bhavishya.app</code> / <code>Student@2026</code>
        </div>
      )}
    </div>
  );
}
