import { CornerDownRight, Link2 } from "lucide-react";
import type { Backlink } from "../../shared/types.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { PageIcon } from "./icon.tsx";

const Ref = ({ link }: { link: Backlink }) => (
  <button type="button" className="backlink" onClick={() => void actions.openPage(link.id)}>
    <span className="backlink-head">
      <PageIcon icon={link.icon} size={14} />
      <span className="backlink-title">{link.title || "Untitled"}</span>
    </span>
    <span className="backlink-snippet">{link.snippet}</span>
  </button>
);

// "What links here" — explicit `[[links]]` plus bare mentions of the title.
export const Backlinks = () => {
  const { backlinks } = useApp();
  const { linked, unlinked } = backlinks;

  if (linked.length === 0 && unlinked.length === 0) {
    return (
      <div className="panel-empty">
        <Link2 size={18} />
        <span>No backlinks yet</span>
      </div>
    );
  }

  return (
    <div className="backlinks">
      {linked.length > 0 ? (
        <div className="backlink-group">
          <h4>
            <Link2 size={12} /> Linked mentions <span>{linked.length}</span>
          </h4>
          {linked.map((l) => (
            <Ref key={`l-${l.id}`} link={l} />
          ))}
        </div>
      ) : null}

      {unlinked.length > 0 ? (
        <div className="backlink-group">
          <h4>
            <CornerDownRight size={12} /> Unlinked mentions <span>{unlinked.length}</span>
          </h4>
          {unlinked.map((l) => (
            <Ref key={`u-${l.id}`} link={l} />
          ))}
        </div>
      ) : null}
    </div>
  );
};
