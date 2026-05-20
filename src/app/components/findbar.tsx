import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { actions } from "../state/actions.ts";

// Find within the current document — uses WebKit's `window.find`.
export const FindBar = () => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const find = (backwards: boolean) => {
    if (!query) return;
    window.find?.(query, false, backwards, true);
  };

  return (
    <div className="findbar">
      <input
        ref={inputRef}
        className="findbar-input"
        placeholder="Find in note…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            find(e.shiftKey);
          } else if (e.key === "Escape") {
            e.preventDefault();
            actions.closeFind();
          }
        }}
      />
      <button type="button" className="findbar-btn" title="Previous" onClick={() => find(true)}>
        <ChevronUp size={14} />
      </button>
      <button type="button" className="findbar-btn" title="Next" onClick={() => find(false)}>
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        className="findbar-btn"
        title="Close (Esc)"
        onClick={() => actions.closeFind()}
      >
        <X size={14} />
      </button>
    </div>
  );
};
