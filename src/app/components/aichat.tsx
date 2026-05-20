import { Bot, Library, Send, Square, Trash2, X } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { PROVIDERS } from "../../shared/providers.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

// Wiki links / tags in AI replies navigate, like the editor preview.
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

export const AiChat = () => {
  const { chat, aiConfig, activePage } = useApp();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const needsKey = aiConfig != null && PROVIDERS[aiConfig.provider].requiresKey && !aiConfig.hasKey;

  return (
    <aside className="aichat">
      <header className="aichat-head">
        <span className="aichat-title">
          <Bot size={15} /> AI Assistant
        </span>
        {aiConfig ? (
          <span className="aichat-provider">{PROVIDERS[aiConfig.provider].label}</span>
        ) : null}
        <span className="aichat-spacer" />
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
              Ask anything — toggle "use current page" to ground answers in what you're reading.
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
                <div
                  className="aichat-md markdown"
                  onClick={onMarkdownClick}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown escapes input
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                />
              ) : m.content ? (
                m.content
              ) : (
                <span className="aichat-dots">●●●</span>
              )}
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
            className="aichat-input"
            value={input}
            placeholder="Message the assistant…"
            rows={2}
            onChange={(e) => setInput(e.target.value)}
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
