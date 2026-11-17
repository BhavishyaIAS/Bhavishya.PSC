import type { Planet, World } from "./worlds";

/**
 * The five places inside every examination. Each module of the platform is a world
 * with its own environment, type and controls (see worlds.css); the order here is the
 * order of the navigation.
 */
export interface Destination {
  tab: string; // the route segment under /exams/<commission>/<exam>/
  world: Extract<World, "mars" | "moon" | "saturn" | "jupiter" | "earth">;
  place: string; // the world's name
  label: string; // what a learner does there
  long: string; // the module's full name
  blurb: string;
}

export const DESTINATIONS: Destination[] = [
  { tab: "materials", world: "mars", place: "Mars", label: "Notes", long: "Material / Notes", blurb: "The research station. Full, prelims and mains notes, topic by topic." },
  { tab: "prelims", world: "moon", place: "The Moon", label: "Prelims PYQs", long: "Prelims PYQs", blurb: "The lunar facility. Previous-year objective questions, answered and explained." },
  { tab: "mains", world: "saturn", place: "Saturn", label: "Mains PYQs", long: "Mains PYQs", blurb: "The long view. Previous-year descriptive questions with model answers." },
  { tab: "syllabus", world: "jupiter", place: "Jupiter", label: "Syllabus", long: "Syllabus Detailer", blurb: "The whole system. Every paper, subject and topic, and how far you have come." },
  { tab: "progress", world: "earth", place: "Earth", label: "Progress", long: "Progress Tracker", blurb: "Mission control. Your coverage of the syllabus, measured." },
];

/** The value of a [data-orb] attribute: how Universe is told which planet to draw where an element is. */
export function orbAttr(p: Planet): string {
  return [...p.a, ...p.b, p.kind, p.ring ? 1 : 0].join(",");
}
