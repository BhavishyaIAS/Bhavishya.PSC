export type Role = "admin" | "student";
export type Status = "draft" | "published";
export type StageKey = "prelims" | "mains";
export type NoteKind = "comprehensive" | "prelims" | "mains";

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: Role;
}

export interface TrackRef {
  id: number;
  commission: string;
  commission_name: string;
  group: string;
  group_name: string;
  label: string;
}

export interface CatalogTrack extends TrackRef {
  tagline: string;
  has_content: boolean;
}

export interface Commission {
  id: number;
  slug: string;
  short_name: string;
  name: string;
  description: string;
  status: Status; // "draft" = hidden from students (admins only ever receive those)
  tracks: CatalogTrack[];
}

export interface TrackDetail extends TrackRef {
  tagline: string;
  commission_full_name: string;
  siblings: TrackRef[];
}

interface NodeBase {
  id: number;
  code: string;
  title: string;
  order: number;
  status: Status;
}
export interface MicroThemeNode extends NodeBase {
  priority: "" | "core" | "important" | "supporting";
  estimated_minutes: number | null;
  is_dual_stage: boolean;
  note_kinds: NoteKind[];
  question_count: number;
  studied: boolean;
}
export interface TopicNode extends NodeBase {
  micro_themes: MicroThemeNode[];
}
export interface SubjectNode extends NodeBase {
  topics: TopicNode[];
}
export interface PaperNode extends NodeBase {
  stage: StageKey;
  description: string;
  subjects: SubjectNode[];
}
export interface SyllabusTree {
  track: TrackRef;
  papers: PaperNode[];
}

export interface PaperCoverage {
  id: number;
  code: string;
  title: string;
  stage: StageKey;
  status: Status;
  micro_themes: number;
  covered: number;
  coverage_pct: number;
  studied: number;
  studied_pct: number;
  prelims_questions: number;
  mains_questions: number;
}
export interface Coverage {
  track: TrackRef;
  micro_themes: number;
  published_micro_themes: number;
  covered_micro_themes: number;
  coverage_pct: number;
  studied_micro_themes: number;
  studied_pct: number;
  prelims_questions: number;
  mains_questions: number;
  materials: number;
  has_content: boolean;
  draft_micro_themes?: number;
  draft_questions?: number;
  papers?: PaperCoverage[];
}

export type RichDoc = { type: "doc"; content?: RichNode[] };
export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface MtRef {
  id: number;
  code: string;
  title: string;
  topic: { id: number; title: string };
  subject: { id: number; title: string };
  paper: { id: number; title: string; stage: StageKey };
}

export interface Question {
  id: number;
  stage: StageKey;
  year: number;
  paper_label: string;
  question_no: number;
  text: string;
  options: { key: "A" | "B" | "C" | "D"; text: string }[] | null;
  correct_option: string;
  explanation: string;
  directive: string;
  marks: number | null;
  model_answer: RichDoc | Record<string, never>;
  keywords: string;
  tags: string[];
  micro_theme: MtRef | null;
  status: Status;
}

export interface Paginated<T> {
  count: number;
  page: number;
  num_pages: number;
  page_size: number;
  results: T[];
}

export interface Facets {
  total: number;
  years: number[];
  paper_labels: string[];
  tags: { tags__slug: string; tags__name: string; n: number }[];
}

export interface Material {
  id: number;
  track: number;
  track_info: TrackRef;
  category: NoteKind;
  title: string;
  description: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  paper: number | null;
  subject: number | null;
  topic: number | null;
  micro_theme: number | null;
  mapping: { level: string; code?: string; crumbs: string[] } | null;
  status: Status;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  kind: NoteKind;
  body: RichDoc;
  status: Status;
  updated_at: string;
}

export interface MicroThemeDetail {
  track: TrackRef;
  micro_theme: {
    id: number;
    code: string;
    title: string;
    status: Status;
    priority: string;
    estimated_minutes: number | null;
    is_dual_stage: boolean;
  };
  breadcrumb: {
    paper: { id: number; title: string; stage: StageKey; code: string };
    subject: { id: number; title: string };
    topic: { id: number; title: string };
  };
  notes: Partial<Record<NoteKind, Note>>;
  videos: { id: number; title: string; url: string }[];
  glossary: { id: number; term: string; definition: string }[];
  questions: Question[];
  materials: Material[];
  studied: boolean;
  prev: { id: number; code: string; title: string } | null;
  next: { id: number; code: string; title: string } | null;
  position: { index: number; total: number };
}

export interface SearchGroup {
  type: string;
  label: string;
  items: {
    id?: number;
    commission: string;
    group: string;
    code?: string;
    kind?: NoteKind;
    stage?: StageKey;
    track_label: string;
    title: string;
    snippet: string;
  }[];
}

export const NOTE_KINDS: { key: NoteKind; label: string; blurb: string }[] = [
  { key: "comprehensive", label: "Comprehensive Notes", blurb: "Complete syllabus-linked reference notes" },
  { key: "prelims", label: "Prelims Notes", blurb: "Concise, fact-focused revision notes per micro-theme" },
  { key: "mains", label: "Mains Notes", blurb: "Condensed analytical notes & answer frameworks" },
];
