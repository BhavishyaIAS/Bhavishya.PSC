import { Atom, Globe2, Landmark, Leaf, type LucideIcon, NotebookText, Scale, TrendingUp } from "lucide-react";

import type { NoteKind, SubjectNode, SyllabusTree } from "./types";

/** A syllabus topic as the Notes tab shows it: one subject of the track, with chapter/section counts. */
export interface TopicSummary {
  subject: SubjectNode;
  chapters: number;
  sections: number;
  byKind: Record<NoteKind, number>;
}

/** Every subject of the track, in syllabus order (papers stay behind the scenes). */
export function syllabusTopics(tree: SyllabusTree): TopicSummary[] {
  return tree.papers.flatMap((p) =>
    p.subjects.map((s) => {
      const mts = s.topics.flatMap((t) => t.micro_themes);
      const count = (k: NoteKind) => mts.filter((m) => m.note_kinds.includes(k)).length;
      return {
        subject: s,
        chapters: s.topics.length,
        sections: mts.length,
        byKind: { comprehensive: count("comprehensive"), prelims: count("prelims"), mains: count("mains") },
      };
    }),
  );
}

const ICONS: Record<string, LucideIcon> = {
  history: Landmark,
  geography: Globe2,
  polity: Scale,
  economy: TrendingUp,
  science: Atom,
  environment: Leaf,
  general: NotebookText,
};

/**
 * A topic's "look" — the family that decides its icon, colour and 3D scene.
 * The admin can choose one (Manage → Topics); otherwise it is read from the name.
 */
export function topicLook(title: string, look = ""): string {
  if (ICONS[look]) return look;
  const t = title.toLowerCase();
  if (t.includes("history") || t.includes("culture")) return "history";
  if (t.includes("geograph")) return "geography";
  if (t.includes("polity") || t.includes("constitution") || t.includes("governance")) return "polity";
  if (t.includes("econom")) return "economy";
  if (t.includes("science") || t.includes("technology")) return "science";
  if (t.includes("environment") || t.includes("ecology")) return "environment";
  return "general";
}

export const topicIcon = (title: string, look = ""): LucideIcon => ICONS[topicLook(title, look)];

/** CSS class for the topic's colour family (see .tone-* in design.css). */
export const topicTone = (title: string, look = ""): string => `tone-${topicLook(title, look)}`;
