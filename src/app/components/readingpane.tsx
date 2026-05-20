import { invoke } from "@basket/ipc/client";
import { PanelLeft, X } from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";
import * as ch from "../../shared/channels.ts";
import type { Page } from "../../shared/types.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { PageIcon } from "./icon.tsx";
import { RenderedMarkdown } from "./renderedmarkdown.tsx";

const onMarkdownClick = (e: MouseEvent<HTMLDivElement>) => {
  const link = (e.target as HTMLElement).closest("a");
  if (!link) return;
  e.preventDefault();
  if (link.classList.contains("wikilink")) {
    void actions.openWikilink(
      link.getAttribute("data-title") ?? "",
      link.getAttribute("data-anchor") || null,
    );
  } else if (link.classList.contains("tag")) {
    const tag = link.getAttribute("data-tag");
    if (tag) void actions.openTag(tag);
  }
};

// A read-only second pane — keep a page open for reference while you write.
export const ReadingPane = () => {
  const { splitId, tree } = useApp();
  const [page, setPage] = useState<Page | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the vault changes too
  useEffect(() => {
    if (splitId === null) {
      setPage(null);
      return;
    }
    let alive = true;
    void invoke(ch.getPage, { id: splitId }).then((p) => {
      if (alive) setPage(p);
    });
    return () => {
      alive = false;
    };
  }, [splitId, tree]);

  if (splitId === null) return null;

  return (
    <aside className="reading-pane">
      <header className="reading-pane-head">
        <span className="reading-pane-title">
          <PageIcon icon={page?.icon ?? ""} size={14} />
          {page?.title || "Loading…"}
        </span>
        <span className="reading-pane-spacer" />
        {page ? (
          <button
            type="button"
            className="icon-btn"
            title="Open in main editor"
            onClick={() => void actions.openPage(page.id)}
          >
            <PanelLeft size={14} />
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn"
          title="Close split"
          onClick={() => actions.setSplit(null)}
        >
          <X size={15} />
        </button>
      </header>
      <div className="reading-pane-body">
        {page ? (
          <article className="reading-pane-doc">
            <h1 className="read-title">
              {page.icon ? <span className="read-icon">{page.icon}</span> : null}
              {page.title || "Untitled"}
            </h1>
            <RenderedMarkdown body={page.body} sourcePath={page.title} onClick={onMarkdownClick} />
          </article>
        ) : null}
      </div>
    </aside>
  );
};
