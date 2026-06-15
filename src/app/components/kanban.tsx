import { Bot, ChevronLeft, ChevronRight, Play, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { KanbanCard, KanbanPriority, KanbanStatus } from "../../shared/types.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

const labels: Record<KanbanStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  doing: "Doing",
  review: "Review",
  done: "Done",
};

const priorities: readonly KanbanPriority[] = ["low", "normal", "high"];

const statusIndex = (status: KanbanStatus): number =>
  ["backlog", "ready", "doing", "review", "done"].indexOf(status);

const Card = ({ card }: { card: KanbanCard }) => {
  const { agents } = useApp();
  const agent = card.agentSlug
    ? (agents.find((item) => item.slug === card.agentSlug) ?? null)
    : null;
  const move = (delta: -1 | 1): void => {
    const columns: readonly KanbanStatus[] = ["backlog", "ready", "doing", "review", "done"];
    const next = columns[statusIndex(card.status) + delta];
    if (next) void actions.moveKanbanCard(card.id, next);
  };
  return (
    <article className="kanban-card">
      <header>
        <strong>{card.title}</strong>
        <span data-priority={card.priority}>{card.priority}</span>
      </header>
      {card.description ? <p>{card.description}</p> : null}
      <label>
        <Bot size={12} />
        <select
          value={card.agentSlug ?? ""}
          onChange={(event) =>
            void actions.updateKanbanCard(card.id, {
              agentSlug: event.target.value || null,
            })
          }
        >
          <option value="">Any agent</option>
          {agents.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <footer>
        <button
          type="button"
          title="Move left"
          disabled={card.status === "backlog"}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={13} />
        </button>
        <button
          type="button"
          title="Send to agent"
          onClick={() => void actions.runKanbanCard(card.id)}
        >
          <Play size={13} />
          <span>{agent ? agent.name : "Agent"}</span>
        </button>
        <button
          type="button"
          title="Move right"
          disabled={card.status === "done"}
          onClick={() => move(1)}
        >
          <ChevronRight size={13} />
        </button>
        <button
          type="button"
          title="Delete card"
          onClick={() => void actions.deleteKanbanCard(card.id)}
        >
          <Trash2 size={13} />
        </button>
      </footer>
    </article>
  );
};

export const Kanban = () => {
  const { kanbanOpen, kanbanBoard, projects, channels, agents } = useApp();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<KanbanPriority>("normal");
  const [agentSlug, setAgentSlug] = useState("");

  const scope = useMemo(() => {
    if (!kanbanBoard) return "Project board";
    if (kanbanBoard.projectSlug) {
      return (
        projects.find((project) => project.slug === kanbanBoard.projectSlug)?.name ??
        "Project board"
      );
    }
    if (kanbanBoard.channelSlug) {
      return (
        channels.find((channel) => channel.slug === kanbanBoard.channelSlug)?.name ??
        "Channel board"
      );
    }
    return "Inbox board";
  }, [channels, kanbanBoard, projects]);

  if (!kanbanOpen) return null;

  const submit = async (): Promise<void> => {
    if (!title.trim()) return;
    await actions.createKanbanCard({
      title,
      description,
      priority,
      agentSlug: agentSlug || null,
      status: "backlog",
    });
    setTitle("");
    setDescription("");
    setPriority("normal");
  };

  return (
    <div className="kanban-overlay">
      <section className="kanban">
        <header className="kanban-head">
          <div>
            <span>Kanban</span>
            <h2>{scope}</h2>
            <p>Track project work and hand the next card to an agent or channel.</p>
          </div>
          <button type="button" title="Close" onClick={() => actions.closeKanban()}>
            <X size={16} />
          </button>
        </header>
        <form
          className="kanban-create"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Card title"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Short description"
          />
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as KanbanPriority)}
          >
            {priorities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={agentSlug} onChange={(event) => setAgentSlug(event.target.value)}>
            <option value="">Any agent</option>
            {agents.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!title.trim()}>
            <Plus size={14} />
            <span>Add</span>
          </button>
        </form>
        <div className="kanban-board">
          {(kanbanBoard?.columns ?? []).map((column) => {
            const cards = kanbanBoard?.cards.filter((card) => card.status === column) ?? [];
            return (
              <section key={column} className="kanban-column">
                <header>
                  <h3>{labels[column]}</h3>
                  <span>{cards.length}</span>
                </header>
                <div className="kanban-columnbody">
                  {cards.length > 0 ? (
                    cards.map((card) => <Card key={card.id} card={card} />)
                  ) : (
                    <p className="kanban-empty">No cards</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
};
