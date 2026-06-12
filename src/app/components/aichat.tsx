import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Hash,
  Library,
  Loader2,
  Pencil,
  Plus,
  Send,
  Slash,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS } from "../../shared/providers.ts";
import type { ToolCall } from "../../shared/types.ts";
import { stripChatToolBlocks } from "../lib/agent.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

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

const StatusIcon = ({ status }: { status: ToolCall["status"] }) => {
  if (status === "pending") return <Loader2 size={12} className="aichat-tool-spin" />;
  if (status === "error") return <CircleAlert size={12} className="aichat-tool-err" />;
  return <CheckCircle2 size={12} className="aichat-tool-ok" />;
};

const ToolCallCard = ({ call }: { call: ToolCall }) => {
  const [open, setOpen] = useState(false);
  const argsJson = useMemo(() => {
    try {
      return JSON.stringify(call.args, null, 2);
    } catch {
      return String(call.args);
    }
  }, [call.args]);
  const resultJson = useMemo(() => {
    if (call.status === "pending") return "";
    if (call.status === "error") return call.error ?? "";
    try {
      return JSON.stringify(call.result, null, 2);
    } catch {
      return String(call.result);
    }
  }, [call.status, call.result, call.error]);

  return (
    <div className="aichat-tool" data-status={call.status}>
      <button
        type="button"
        className="aichat-tool-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Wrench size={11} />
        <span className="aichat-tool-name">{call.name}</span>
        <StatusIcon status={call.status} />
      </button>
      {open ? (
        <div className="aichat-tool-body">
          <div className="aichat-tool-label">args</div>
          <pre className="aichat-tool-pre">{argsJson}</pre>
          {call.status !== "pending" ? (
            <>
              <div className="aichat-tool-label">
                {call.status === "error" ? "error" : "result"}
              </div>
              <pre className="aichat-tool-pre">{resultJson}</pre>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const AgentPicker = () => {
  const { agents, channels, chat } = useApp();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = chat.agentSlug ? (agents.find((a) => a.slug === chat.agentSlug) ?? null) : null;
  const activeChannel = chat.channelSlug
    ? (channels.find((c) => c.slug === chat.channelSlug) ?? null)
    : null;

  const pickAgent = (slug: string | null) => {
    actions.setAgent(slug);
    setOpen(false);
  };

  const pickChannel = (slug: string) => {
    actions.setChannel(slug);
    setOpen(false);
  };

  const createNew = async () => {
    setOpen(false);
    actions.openAgentWizard();
  };

  const createChannel = async () => {
    setOpen(false);
    actions.openChannelWizard();
  };

  return (
    <div className="aichat-agent" ref={wrapRef}>
      <button
        type="button"
        className="aichat-agent-btn"
        onClick={() => setOpen((v) => !v)}
        title="Switch agent"
      >
        <span className="aichat-agent-icon">
          {activeChannel?.icon ?? active?.icon ?? "\u{1F916}"}
        </span>
        <span className="aichat-agent-label">
          {activeChannel?.name ?? active?.name ?? "Plain assistant"}
        </span>
        <ChevronDown size={11} />
      </button>
      {open ? (
        <div className="aichat-agent-menu" role="listbox">
          <button
            type="button"
            className="aichat-agent-opt"
            data-active={chat.agentSlug === null && chat.channelSlug === null}
            onClick={() => pickAgent(null)}
          >
            <span className="aichat-agent-icon">{"\u{1F4AC}"}</span>
            <span className="aichat-agent-opt-text">
              <span className="aichat-agent-opt-name">Plain assistant</span>
              <span className="aichat-agent-opt-desc">No tools — chat-only.</span>
            </span>
          </button>
          {agents.map((agent) => (
            <button
              type="button"
              key={agent.slug}
              className="aichat-agent-opt"
              data-active={chat.agentSlug === agent.slug}
              onClick={() => pickAgent(agent.slug)}
            >
              <span className="aichat-agent-icon">{agent.icon}</span>
              <span className="aichat-agent-opt-text">
                <span className="aichat-agent-opt-name">{agent.name}</span>
                {agent.description ? (
                  <span className="aichat-agent-opt-desc">{agent.description}</span>
                ) : null}
              </span>
              <button
                type="button"
                className="aichat-agent-opt-edit"
                title="Edit agent"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  void actions.openAgentEditor("agent", agent.slug);
                }}
              >
                <Pencil size={11} />
              </button>
            </button>
          ))}
          {channels.length > 0 ? <div className="aichat-agent-sep" /> : null}
          {channels.map((channel) => (
            <button
              type="button"
              key={channel.slug}
              className="aichat-agent-opt"
              data-active={chat.channelSlug === channel.slug}
              onClick={() => pickChannel(channel.slug)}
            >
              <span className="aichat-agent-icon">{channel.icon || "\u{1F4AC}"}</span>
              <span className="aichat-agent-opt-text">
                <span className="aichat-agent-opt-name">{channel.name}</span>
                <span className="aichat-agent-opt-desc">
                  {channel.description || `${channel.agents.length} member agent(s).`}
                </span>
              </span>
              <button
                type="button"
                className="aichat-agent-opt-edit"
                title="Channel profile"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  actions.openChannelProfile(channel.slug);
                }}
              >
                <Hash size={11} />
              </button>
            </button>
          ))}
          <div className="aichat-agent-sep" />
          <button type="button" className="aichat-agent-new" onClick={createNew}>
            <Plus size={11} /> New agent…
          </button>
          <button type="button" className="aichat-agent-new" onClick={createChannel}>
            <Hash size={11} /> New channel…
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const AiChat = () => {
  const { chat, aiConfig, activePage, agents, channels, commands } = useApp();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the bottom on every new message or streamed chunk
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  const send = () => {
    const text = input;
    if (!text.trim() || chat.streaming) return;
    setInput("");
    void actions.sendChat(text);
  };

  // A `/` typed at the very start of the input opens the command palette.
  const onInputChange = (value: string) => {
    if (value === "/" && commands.length > 0) {
      setInput("");
      actions.setCommandPalette(true);
      return;
    }
    setInput(value);
  };

  const needsKey = aiConfig != null && PROVIDERS[aiConfig.provider].requiresKey && !aiConfig.hasKey;
  const activeAgent = chat.agentSlug
    ? (agents.find((a) => a.slug === chat.agentSlug) ?? null)
    : null;
  const activeChannel = chat.channelSlug
    ? (channels.find((c) => c.slug === chat.channelSlug) ?? null)
    : null;

  return (
    <aside className="aichat">
      <header className="aichat-head">
        <span className="aichat-title">
          <Bot size={15} /> AI Assistant
        </span>
        <AgentPicker />
        <span className="aichat-spacer" />
        <button
          type="button"
          className="icon-btn"
          title="Run command (/)"
          onClick={() => actions.setCommandPalette(true)}
        >
          <Slash size={13} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Clear conversation"
          onClick={() => actions.clearChat()}
        >
          <Trash2 size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Close (⌘J)"
          onClick={() => actions.toggleAi()}
        >
          <X size={15} />
        </button>
      </header>

      <div className="aichat-scroll" ref={scrollRef}>
        {chat.messages.length === 0 ? (
          <div className="aichat-empty">
            <Bot size={26} />
            <p>
              {activeAgent
                ? activeAgent.description ||
                  `Chat with ${activeAgent.name}. Type "/" to run a command.`
                : activeChannel
                  ? activeChannel.description ||
                    `Chat in ${activeChannel.name} with ${activeChannel.agents.length} agent(s).`
                  : 'Ask anything — pick an agent above to give the assistant tools, or type "/" to run a command.'}
            </p>
            {needsKey ? (
              <button type="button" className="aichat-cta" onClick={() => actions.openSettings()}>
                Set up your API key →
              </button>
            ) : null}
          </div>
        ) : (
          chat.messages.map((m, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: chat log is append-only
              key={`m-${i}`}
              className="aichat-msg"
              data-role={m.role}
            >
              {m.role === "assistant" && m.content ? (
                // biome-ignore lint/a11y/noStaticElementInteractions: rendered-markdown click delegation — links inside are real, focusable anchors
                // biome-ignore lint/a11y/useKeyWithClickEvents: same — the anchors handle keyboard activation themselves
                <div
                  className="aichat-md markdown"
                  onClick={onMarkdownClick}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown escapes input
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(stripChatToolBlocks(m.content)),
                  }}
                />
              ) : m.content ? (
                m.content
              ) : (
                <span className="aichat-dots">●●●</span>
              )}
              {m.toolCalls && m.toolCalls.length > 0 ? (
                <div className="aichat-tools">
                  {m.toolCalls.map((call) => (
                    <ToolCallCard key={call.id} call={call} />
                  ))}
                </div>
              ) : null}
              {m.sources && m.sources.length > 0 ? (
                <div className="aichat-sources">
                  <Library size={11} />
                  {m.sources.map((title) => (
                    <button
                      type="button"
                      key={title}
                      className="aichat-source"
                      onClick={() => void actions.resolveWikilink(title)}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="aichat-compose">
        <div className="aichat-ctx-row">
          <label className="aichat-ctx">
            <input
              type="checkbox"
              checked={chat.useContext}
              onChange={(e) => actions.setAiContext(e.target.checked)}
            />
            <span>This page{activePage ? ` — ${activePage.title || "Untitled"}` : ""}</span>
          </label>
          <label className="aichat-ctx">
            <input
              type="checkbox"
              checked={chat.useVault}
              onChange={(e) => actions.setAiVault(e.target.checked)}
            />
            <span>Search my vault</span>
          </label>
        </div>
        <div className="aichat-inputrow">
          <textarea
            ref={inputRef}
            className="aichat-input"
            value={input}
            placeholder={
              activeChannel
                ? `Message ${activeChannel.name}…`
                : activeAgent
                  ? `Message ${activeAgent.name}… (/ for commands)`
                  : "Message the assistant… (/ for commands)"
            }
            rows={2}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {chat.streaming ? (
            <button
              type="button"
              className="aichat-send"
              title="Stop"
              onClick={() => actions.cancelChat()}
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="aichat-send"
              title="Send (Enter)"
              disabled={!input.trim()}
              onClick={send}
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
