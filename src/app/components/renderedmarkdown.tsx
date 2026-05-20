// Renders a markdown body to HTML *and* runs every plugin-registered markdown
// post-processor / code-block processor over the result. Narrative's own
// renderer stays the source of truth; this is the seam that lets a plugin's
// processors fire anywhere markdown is shown (reading pane, hover preview,
// page embeds).

import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";
import { renderMarkdown } from "../lib/markdown.ts";
import { makeContext, runMarkdownProcessors } from "../plugins/obsidian/markdown.ts";

type Props = {
  body: string;
  sourcePath?: string;
  className?: string;
  slice?: number;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
};

export const RenderedMarkdown = ({
  body,
  sourcePath = "",
  className = "markdown",
  slice,
  onClick,
}: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const md = slice !== undefined ? body.slice(0, slice) : body;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `renderMarkdown` escapes user input; plugin processors run after.
    el.innerHTML = renderMarkdown(md);
    void runMarkdownProcessors(el, makeContext(sourcePath));
  }, [md, sourcePath]);

  return <div className={className} ref={ref} onClick={onClick} />;
};
