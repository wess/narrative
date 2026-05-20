import { List } from "lucide-react";
import { useMemo } from "react";
import { extractHeadings } from "../lib/markdown.ts";

// Document outline built from the page's headings. Clicking scrolls the
// rendered preview to that heading (visible in split / preview modes).
export const Outline = ({ body }: { body: string }) => {
  const headings = useMemo(() => extractHeadings(body), [body]);

  if (headings.length === 0) {
    return (
      <div className="panel-empty">
        <List size={18} />
        <span>No headings yet</span>
      </div>
    );
  }

  return (
    <nav className="outline">
      {headings.map((h) => (
        <button
          type="button"
          key={h.slug}
          className="outline-item"
          style={{ paddingLeft: `${(h.level - 1) * 12 + 4}px` }}
          data-level={h.level}
          onClick={() => {
            document.getElementById(h.slug)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {h.text}
        </button>
      ))}
    </nav>
  );
};
