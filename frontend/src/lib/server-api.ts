import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import type { User } from "./types";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
export const SESSION_COOKIE = "bp_session";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/**
 * Server-side call to the Django API on behalf of the signed-in user.
 * The session token never reaches client JavaScript: it lives in an httpOnly
 * cookie and is forwarded here as an Authorization header.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Token ${token}`);
  const res = await fetch(`${API_ORIGIN}/api${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {}
    throw new ApiError(res.status, body);
  }
  return (await res.json()) as T;
}

/** Like `api`, but maps 401 → login redirect and 404 → notFound(). For pages. */
export async function load<T>(path: string, nextPath?: string): Promise<T> {
  try {
    return await api<T>(path);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
      if (err.status === 404) notFound();
    }
    throw err;
  }
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return (await api<{ user: User }>("/auth/me/")).user;
  } catch {
    return null;
  }
}

export async function requireUser(nextPath = "/"): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}
