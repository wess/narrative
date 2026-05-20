import { Hash } from "lucide-react";
import { useMemo } from "react";
import { openMenu } from "../lib/contextmenu.ts";
import { relativeTime } from "../lib/dates.ts";
import { buildTagTree } from "../lib/tags.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { buildPageMenu } from "./contextmenu.tsx";
import { PageIcon } from "./icon.tsx";
import { TagTree } from "./tagtree.tsx";

export const TagsView = () => {
  const { tags, tagFilter } = useApp();
  const active = tagFilter.tag;
  const tagTree = useMemo(() => buildTagTree(tags), [tags]);

  return (
    <div className="tagsview">
      <aside className="tagsview-list">
        <h3>All tags</h3>
        {tags.length === 0 ? (
          <p className="tagsview-empty">Add #tags inside any page.</p>
        ) : (
          <TagTree nodes={tagTree} activeTag={active} onPick={(t) => void actions.openTag(t)} />
        )}
      </aside>

      <section className="tagsview-pages">
        {active === null ? (
          <div className="tagsview-hint">
            <Hash size={26} />
            <p>Pick a tag to see every page that uses it.</p>
          </div>
        ) : (
          <>
            <h2>
              <Hash size={20} />
              {active}
              <span className="tagsview-pages-count">{tagFilter.pages.length}</span>
            </h2>
            {tagFilter.pages.length === 0 ? (
              <p className="tagsview-empty">Nothing tagged #{active} anymore.</p>
            ) : (
              <div className="tagsview-grid">
                {tagFilter.pages.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="tagsview-card"
                    onClick={() => void actions.openPage(p.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openMenu(e.clientX, e.clientY, buildPageMenu(p));
                    }}
                  >
                    <span className="tagsview-card-head">
                      <PageIcon icon={p.icon} size={16} />
                      {p.title || "Untitled"}
                    </span>
                    <span className="tagsview-card-meta">{relativeTime(p.updatedAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
