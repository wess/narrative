import { ArrowUpRight } from "lucide-react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";
import { PageIcon } from "./icon.tsx";

// "Links from here" — the pages this page points at via wiki links.
export const Outgoing = () => {
  const { outgoing } = useApp();

  if (outgoing.length === 0) {
    return (
      <div className="panel-empty">
        <ArrowUpRight size={18} />
        <span>No outgoing links</span>
      </div>
    );
  }

  return (
    <div className="backlinks">
      {outgoing.map((link) => (
        <button
          type="button"
          key={link.id}
          className="backlink"
          onClick={() => void actions.openPage(link.id)}
        >
          <span className="backlink-head">
            <PageIcon icon={link.icon} size={14} />
            <span className="backlink-title">{link.title || "Untitled"}</span>
          </span>
          <span className="backlink-snippet">{link.snippet}</span>
        </button>
      ))}
    </div>
  );
};
