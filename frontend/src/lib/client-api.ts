"use client";

/**
 * Browser-side calls. They go to same-origin `/api/*` (rewritten to Django by
 * Next.js), so the httpOnly session cookie is attached automatically. The
 * X-Requested-With header is required by the API for every write (CSRF guard).
 */
export class ClientApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown> | null,
  ) {
    super(describeError(body) || `Request failed (${status})`);
  }
}

export function describeError(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  if (typeof b.detail === "string") return b.detail;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(b)) {
    const msg = Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : "";
    if (msg) parts.push(k === "non_field_errors" ? msg : `${k.replace(/_/g, " ")}: ${msg}`);
  }
  return parts.join(" · ");
}

export async function clientApi<T = unknown>(
  path: string,
  init: Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Requested-With", "XMLHttpRequest");
  headers.set("Accept", "application/json");
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`/api${path}`, { ...init, headers, body, credentials: "same-origin" });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new ClientApiError(res.status, data as Record<string, unknown> | null);
  return data as T;
}
