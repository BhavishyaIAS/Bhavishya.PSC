import "server-only";

import { cache } from "react";

import { api, ApiError, publicApi } from "./server-api";
import type { Commission } from "./types";

/** The exams this visitor may see (fetched once per request, however many components ask). */
export const getCommissions = cache(async (): Promise<Commission[]> => {
  try {
    return (await api<{ results: Commission[] }>("/commissions/")).results;
  } catch (err) {
    // A session that has expired must not empty the public catalogue: ask again as a visitor.
    if (err instanceof ApiError && err.status === 401) {
      try {
        return (await publicApi<{ results: Commission[] }>("/commissions/")).results;
      } catch {}
    }
    return [];
  }
});
