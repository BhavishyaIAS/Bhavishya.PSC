import { BarChart3, FileText, Home, LayoutGrid, Settings } from "lucide-react";

export function navItems(commission: string, isAdmin: boolean) {
  const items = [
    { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || /^\/exams\/[^/]+$/.test(p) },
    {
      href: `/exams/${commission}/group-1`,
      label: "Group 1",
      icon: FileText,
      match: (p: string) => /^\/exams\/[^/]+\/group-1/.test(p),
    },
    {
      href: `/exams/${commission}/group-2`,
      label: "Group 2",
      icon: LayoutGrid,
      match: (p: string) => /^\/exams\/[^/]+\/group-2/.test(p),
    },
    { href: "/progress", label: "Progress Tracker", short: "Progress", icon: BarChart3, match: (p: string) => p === "/progress" },
  ];
  if (isAdmin) {
    items.push({ href: "/manage", label: "Manage", icon: Settings, match: (p: string) => p.startsWith("/manage") });
  }
  return items;
}
