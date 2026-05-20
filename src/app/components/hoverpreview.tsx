import { invoke } from "@basket/ipc/client";
import { useEffect, useState } from "react";
import * as ch from "../../shared/channels.ts";
import type { Page } from "../../shared/types.ts";
import { RenderedMarkdown } from "./renderedmarkdown.tsx";

type Preview = { page: Page; x: number; y: number };

// Hovering any `.wikilink` anywhere in the app peeks at the target page.
export const HoverPreview = () => {
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let token = 0;

    const clear = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      token += 1;
      setPreview(null);
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const link = target ? target.closest("a.wikilink") : null;
      if (!link) return;
      const title = link.getAttribute("data-title");
      if (!title?.trim()) return;
      if (timer !== undefined) window.clearTimeout(timer);
      token += 1;
      const my = token;
      const rect = link.getBoundingClientRect();
      timer = window.setTimeout(() => {
        void invoke(ch.pageByTitle, { title }).then((page) => {
          if (page && my === token) setPreview({ page, x: rect.left, y: rect.bottom + 6 });
        });
      }, 340);
    };

    const onOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("a.wikilink")) clear();
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    window.addEventListener("scroll", clear, true);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      window.removeEventListener("scroll", clear, true);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  if (!preview) return null;
  const left = Math.max(8, Math.min(preview.x, window.innerWidth - 372));
  const top = Math.min(preview.y, window.innerHeight - 280);

  return (
    <div className="hover-preview" style={{ left, top }}>
      <div className="hover-preview-title">
        {preview.page.icon ? <span>{preview.page.icon}</span> : null}
        {preview.page.title || "Untitled"}
      </div>
      {preview.page.body.trim() ? (
        <RenderedMarkdown
          body={preview.page.body}
          slice={700}
          sourcePath={preview.page.title}
          className="hover-preview-body markdown"
        />
      ) : (
        <div className="hover-preview-empty">Empty page</div>
      )}
    </div>
  );
};
