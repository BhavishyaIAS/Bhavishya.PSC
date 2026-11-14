import { BarChart3, FileText, Home, LayoutGrid, Settings } from "lucide-react";

export type NavExam = { commission: string; group: string; group_name: string };

/** Home · the current commission's first two exams · Progress (· Manage for admins). */
export function navItems(exams: NavExam[], isAdmin: boolean) {
  const items = [
    { href: "/", label: "Home", short: "", icon: Home, match: (p: string) => p === "/" || /^\/exams\/[^/]+$/.test(p) },
    ...exams.slice(0, 2).map((e, i) => ({
      href: `/exams/${e.commission}/${e.group}`,
      label: e.group_name,
      short: e.group_name.length > 11 ? `${e.group_name.slice(0, 10)}…` : "",
      icon: i === 0 ? FileText : LayoutGrid,
      match: (p: string) => p === `/exams/${e.commission}/${e.group}` || p.startsWith(`/exams/${e.commission}/${e.group}/`),
    })),
    { href: "/progress", label: "Progress Tracker", short: "Progress", icon: BarChart3, match: (p: string) => p === "/progress" },
  ];
  if (isAdmin) {
    items.push({ href: "/manage", label: "Manage", short: "", icon: Settings, match: (p: string) => p.startsWith("/manage") });
  }
  return items;
}
