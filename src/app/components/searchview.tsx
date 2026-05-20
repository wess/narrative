import { Search } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { openMenu } from "../lib/contextmenu.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { buildPageMenu } from "./contextmenu.tsx";
import { PageIcon } from "./icon.tsx";

// FTS snippets arrive with « » around matched terms — turn those into marks.
const highlight = (snippet: string): ReactNode => {
  const parts = snippet.split(/(«[^»]*»)/g);
  let offset = 0;
  return parts.map((part) => {
    const key = `${offset}:${part.length}`;
    offset += part.length;
    if (part.startsWith("«") && part.endsWith("»")) {
      return <mark key={key}>{part.slice(1, -1)}</mark>;
    }
    return <span key={key}>{part}</span>;
  });
};

export const SearchView = () => {
  const { search } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="searchview">
      <div className="searchview-bar">
        <Search size={18} />
        <input
          ref={inputRef}
          placeholder="Search every page…"
          value={search.query}
          onChange={(e) => void actions.runSearch(e.target.value)}
        />
      </div>

      {search.query.trim() === "" ? (
        <div className="searchview-hint">
          <Search size={26} />
          <p>Search titles and full page contents.</p>
          <div className="searchview-ops">
            <code>tag:project</code>
            <code>title:notes</code>
            <code>/regex/i</code>
          </div>
        </div>
      ) : search.hits.length === 0 ? (
        <div className="searchview-hint">
          <p>
            No pages match <strong>“{search.query}”</strong>.
          </p>
        </div>
      ) : (
        <div className="searchview-results">
          <div className="searchview-count">
            {search.hits.length} result{search.hits.length === 1 ? "" : "s"}
          </div>
          {search.hits.map((hit) => (
            <button
              type="button"
              key={hit.id}
              className="search-hit"
              onClick={() => void actions.openPage(hit.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                // Search only ever returns file nodes.
                openMenu(e.clientX, e.clientY, buildPageMenu({ ...hit, kind: "file" }));
              }}
            >
              <span className="search-hit-title">
                <PageIcon icon={hit.icon} size={15} />
                {hit.title || "Untitled"}
              </span>
              <span className="search-hit-snippet">{highlight(hit.snippet)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
