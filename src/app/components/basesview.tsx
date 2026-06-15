import {
  Bot,
  Columns3,
  FileText,
  FolderOpen,
  GitBranch,
  Hash,
  RefreshCw,
  Search,
  TableProperties,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PropertySubjectType } from "../../shared/types.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

const typeIcons = {
  page: FileText,
  project: FolderOpen,
  agent: Bot,
  channel: Hash,
  workflow: GitBranch,
} as const;

const labels: Record<PropertySubjectType | "all", string> = {
  all: "All",
  page: "Pages",
  project: "Projects",
  agent: "Agents",
  channel: "Channels",
  workflow: "Workflows",
};

export const BasesView = () => {
  const { baseView } = useApp();
  const [filter, setFilter] = useState<PropertySubjectType | "all">("all");
  const [query, setQuery] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!baseView) void actions.refreshBases();
  }, [baseView]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (
      baseView?.rows.filter((row) => {
        if (filter !== "all" && row.subjectType !== filter) return false;
        if (!term) return true;
        return (
          row.subjectName.toLowerCase().includes(term) ||
          Object.values(row.values).some((value) => value.toLowerCase().includes(term))
        );
      }) ?? []
    );
  }, [baseView, filter, query]);

  const counts = useMemo(() => {
    const next: Record<PropertySubjectType | "all", number> = {
      all: baseView?.rows.length ?? 0,
      page: 0,
      project: 0,
      agent: 0,
      channel: 0,
      workflow: 0,
    };
    for (const row of baseView?.rows ?? []) next[row.subjectType] += 1;
    return next;
  }, [baseView]);

  const visibleColumns = useMemo(
    () => baseView?.columns.filter((column) => !hiddenColumns.includes(column)) ?? [],
    [baseView, hiddenColumns],
  );

  const toggleColumn = (column: string): void => {
    setHiddenColumns((current) =>
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column],
    );
  };

  const openRow = (type: PropertySubjectType, id: string): void => {
    if (type === "page") {
      const pageId = Number(id);
      if (Number.isFinite(pageId)) void actions.openPage(pageId);
      return;
    }
    if (type === "project") {
      void actions.openProjectInspector(id);
      return;
    }
    if (type === "agent") {
      actions.openAgentProfile(id);
      return;
    }
    if (type === "workflow") {
      void actions.openWorkflows();
      return;
    }
    void actions.openChannelProfile(id);
  };

  return (
    <div className="basesview">
      <header className="basesview-head">
        <div>
          <span>Library</span>
          <h1>Table</h1>
          <p>Pages, projects, agents, and channels in one view.</p>
        </div>
        <button
          type="button"
          className="basesview-refresh"
          onClick={() => void actions.refreshBases()}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </header>

      <div className="basesview-filters">
        {(["all", "page", "project", "agent", "channel", "workflow"] as const).map((kind) => (
          <button
            type="button"
            key={kind}
            data-active={filter === kind}
            onClick={() => setFilter(kind)}
          >
            {labels[kind]}
            <span>{counts[kind]}</span>
          </button>
        ))}
      </div>

      <div className="basesview-tools">
        <div className="basesview-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a record or value"
          />
        </div>
        <div className="basesview-columns">
          <button
            type="button"
            className="basesview-columnbtn"
            onClick={() => setColumnsOpen((open) => !open)}
          >
            <Columns3 size={14} />
            Columns
          </button>
          {columnsOpen ? (
            <div className="basesview-columnmenu">
              {baseView?.columns.length ? (
                baseView.columns.map((column) => (
                  <label key={column}>
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.includes(column)}
                      onChange={() => toggleColumn(column)}
                    />
                    <span>{column}</span>
                  </label>
                ))
              ) : (
                <span className="basesview-columnempty">No columns</span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {!baseView ? (
        <div className="basesview-empty">
          <TableProperties size={28} />
          <p>Loading table...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="basesview-empty">
          <TableProperties size={28} />
          <p>No records match this filter.</p>
        </div>
      ) : (
        <div className="basesview-tablewrap">
          <table className="basesview-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Type</th>
                {visibleColumns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const Icon = typeIcons[row.subjectType];
                return (
                  <tr key={`${row.subjectType}:${row.subjectId}`}>
                    <td>
                      <button
                        type="button"
                        className="basesview-record"
                        onClick={() => openRow(row.subjectType, row.subjectId)}
                      >
                        <Icon size={14} />
                        <span>{row.subjectName}</span>
                      </button>
                    </td>
                    <td>
                      <span className="basesview-kind">{row.subjectType}</span>
                    </td>
                    {visibleColumns.map((column) => (
                      <td key={column}>{row.values[column] ?? ""}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
