import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getSite } from "./site";
import type { Skin } from "./types";

export const SKINS: Skin[] = ["living", "sky", "classic"];
export const SKIN_COOKIE = "bp_skin";

/** The look this visitor sees: their own choice (the footer's Look switch), else the site's (Site settings). */
export const getSkin = cache(async (): Promise<Skin> => {
  const own = (await cookies()).get(SKIN_COOKIE)?.value as Skin | undefined;
  if (own && SKINS.includes(own)) return own;
  return (await getSite()).skin;
});
