import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

/** True when an optional image slot under /public has been filled in. */
export function hasPublicAsset(src?: string) {
  if (!src || !src.startsWith("/")) return false;
  return existsSync(path.join(process.cwd(), "public", src));
}
