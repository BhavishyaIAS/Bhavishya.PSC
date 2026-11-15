import "server-only";

import { cache } from "react";

import { publicApi } from "./server-api";
import { NOTE_KINDS, type Site } from "./types";

const DEFAULTS: Site = {
  focus: null,
  focus_name: "",
  hero_eyebrow: "",
  hero_lead: "",
  note_kinds: NOTE_KINDS.map((k) => ({ ...k, enabled: true })),
  reader_font: "sans",
  reader_size: 2,
  show_codes: true,
  show_contents: true,
  backdrops: true,
};

/** Site settings, fetched once per request. Falls back to the defaults if the API can't be reached. */
export const getSite = cache(async (): Promise<Site> => {
  try {
    return { ...DEFAULTS, ...(await publicApi<Site>("/site/")) };
  } catch {
    return DEFAULTS;
  }
});
