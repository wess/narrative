import {
  Bot,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  Hash,
  Plus,
  RefreshCw,
  Shapes,
  Trash2,
} from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasNode, PropertySubjectType } from "../../shared/types.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

const typeIcons = {
  page: FileText,
  project: FolderOpen,
  agent: Bot,
  channel: Hash,
  workflow: GitBranch,
} as const;

const typeLabels: Record<PropertySubjectType, string> = {
  page: "Page",
  project: "Project",
  agent: "Agent",
  channel: "Channel",
  workflow: "Workflow",
};

type Position = {
  readonly x: number;
  readonly y: number;
};

type DragState = {
  readonly id: string;
  readonly offsetX: number;
  readonly offsetY: number;
};

export const CanvasView = () => {
  const { canvasView } = useApp();
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<Record<string, Position>>({});
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!canvasView) void actions.refreshCanvas();
  }, [canvasView]);

  const nodePosition = (node: CanvasNode): Position => draft[node.id] ?? { x: node.x, y: node.y };

  const bounds = useMemo(() => {
    let maxX = 960;
    let maxY = 620;
    for (const node of canvasView?.nodes ?? []) {
      const pos = draft[node.id] ?? { x: node.x, y: node.y };
      maxX = Math.max(maxX, pos.x + node.width + 80);
      maxY = Math.max(maxY, pos.y + node.height + 80);
    }
    return { width: maxX, height: maxY };
  }, [canvasView, draft]);

  const positionForPointer = (
    event: PointerEvent<HTMLDivElement>,
    dragState: DragState,
  ): Position => {
    const board = boardRef.current;
    if (!board) return { x: 0, y: 0 };
    const rect = board.getBoundingClientRect();
    return {
      x: Math.max(10, event.clientX - rect.left + board.scrollLeft - dragState.offsetX),
      y: Math.max(10, event.clientY - rect.top + board.scrollTop - dragState.offsetY),
    };
  };

  const openNode = (node: CanvasNode): void => {
    if (node.subjectType === "page") {
      const pageId = Number(node.subjectId);
      if (Number.isFinite(pageId)) void actions.openPage(pageId);
      return;
    }
    if (node.subjectType === "project") {
      void actions.openProjectInspector(node.subjectId);
      return;
    }
    if (node.subjectType === "agent") {
      actions.openAgentProfile(node.subjectId);
      return;
    }
    if (node.subjectType === "workflow") {
      void actions.openWorkflows();
      return;
    }
    void actions.openChannelProfile(node.subjectId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!drag) return;
    const next = positionForPointer(event, drag);
    setDraft((current) => ({ ...current, [drag.id]: next }));
  };

  const onPointerUp = (): void => {
    if (!drag) return;
    const final = draft[drag.id];
    setDrag(null);
    if (final) {
      void actions.moveCanvasNode(drag.id, final.x, final.y).then(() => {
        setDraft((current) => {
          const next = { ...current };
          delete next[drag.id];
          return next;
        });
      });
    }
  };

  const nodeById = useMemo(
    () => new Map((canvasView?.nodes ?? []).map((node) => [node.id, node])),
    [canvasView],
  );

  return (
    <div className="canvasview">
      <header className="canvasview-head">
        <div>
          <span>Canvas</span>
          <h1>Workspace map</h1>
          <p>Pages, projects, channels, and agents arranged as a persistent working map.</p>
        </div>
        <div className="canvasview-actions">
          <div className="canvasview-add">
            <button
              type="button"
              className="canvasview-refresh"
              disabled={!canvasView || canvasView.availableNodes.length === 0}
              onClick={() => setAddOpen((open) => !open)}
            >
              <Plus size={14} />
              Add node
            </button>
            {addOpen && canvasView ? (
              <div className="canvasview-addmenu">
                {canvasView.availableNodes.length > 0 ? (
                  canvasView.availableNodes.map((node) => {
                    const Icon = typeIcons[node.subjectType];
                    return (
                      <button
                        type="button"
                        key={node.id}
                        onClick={() => {
                          setAddOpen(false);
                          void actions.addCanvasNode(node.id);
                        }}
                      >
                        <Icon size={13} />
                        <span>{node.title}</span>
                        <small>{typeLabels[node.subjectType]}</small>
                      </button>
                    );
                  })
                ) : (
                  <span>No hidden nodes</span>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="canvasview-refresh"
            onClick={() => void actions.refreshCanvas()}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </header>

      {!canvasView ? (
        <div className="canvasview-empty">
          <Shapes size={28} />
          <p>Loading canvas...</p>
        </div>
      ) : canvasView.nodes.length === 0 ? (
        <div className="canvasview-empty">
          <Shapes size={28} />
          <p>Add pages, projects, agents, or channels to populate the canvas.</p>
        </div>
      ) : (
        <div
          className="canvasview-board"
          ref={boardRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="canvasview-surface"
            style={{ width: bounds.width, height: bounds.height }}
          >
            <svg
              className="canvasview-edges"
              width={bounds.width}
              height={bounds.height}
              aria-hidden="true"
            >
              {canvasView.edges.map((edge) => {
                const from = nodeById.get(edge.from);
                const to = nodeById.get(edge.to);
                if (!from || !to) return null;
                const fromPos = nodePosition(from);
                const toPos = nodePosition(to);
                const x1 = fromPos.x + from.width / 2;
                const y1 = fromPos.y + from.height / 2;
                const x2 = toPos.x + to.width / 2;
                const y2 = toPos.y + to.height / 2;
                return (
                  <g key={edge.id}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    {edge.label ? (
                      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2}>
                        {edge.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {canvasView.nodes.map((node) => {
              const Icon = typeIcons[node.subjectType];
              const pos = nodePosition(node);
              return (
                <article
                  key={node.id}
                  className="canvasview-node"
                  data-type={node.subjectType}
                  title="Drag to move"
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: node.width,
                    minHeight: node.height,
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const board = boardRef.current;
                    const rect = board?.getBoundingClientRect();
                    const current = nodePosition(node);
                    setDrag({
                      id: node.id,
                      offsetX:
                        event.clientX - (rect?.left ?? 0) + (board?.scrollLeft ?? 0) - current.x,
                      offsetY:
                        event.clientY - (rect?.top ?? 0) + (board?.scrollTop ?? 0) - current.y,
                    });
                  }}
                  onDoubleClick={() => openNode(node)}
                >
                  <div className="canvasview-nodehead">
                    <Icon size={15} />
                    <span>{typeLabels[node.subjectType]}</span>
                  </div>
                  <strong>{node.title}</strong>
                  {node.subtitle ? <p>{node.subtitle}</p> : null}
                  <button
                    type="button"
                    className="canvasview-open"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => openNode(node)}
                  >
                    <ExternalLink size={12} />
                    Open
                  </button>
                  <button
                    type="button"
                    className="canvasview-remove"
                    title="Remove from canvas"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => void actions.removeCanvasNode(node.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
