import "server-only";

import { api } from "./server-api";
import type { Commission } from "./types";

export async function getCommissions(): Promise<Commission[]> {
  try {
    return (await api<{ results: Commission[] }>("/commissions/")).results;
  } catch {
    return [];
  }
}
