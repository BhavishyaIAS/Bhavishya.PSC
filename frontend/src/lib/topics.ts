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

/** A fitting icon for a topic, from the words in its name. */
export function topicIcon(title: string): LucideIcon {
  const t = title.toLowerCase();
  if (t.includes("history")) return Landmark;
  if (t.includes("geograph")) return Globe2;
  if (t.includes("polity") || t.includes("constitution") || t.includes("governance")) return Scale;
  if (t.includes("econom")) return TrendingUp;
  if (t.includes("science") || t.includes("technology")) return Atom;
  if (t.includes("environment") || t.includes("ecology")) return Leaf;
  return NotebookText;
}
