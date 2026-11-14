import { createElement } from "react";

import { topicIcon } from "@/lib/topics";

/** The icon for a topic's look (chosen by the admin, or read from its name). */
export function TopicGlyph({ title, look = "", size = 18 }: { title: string; look?: string; size?: number }) {
  return createElement(topicIcon(title, look), { size, "aria-hidden": true });
}
