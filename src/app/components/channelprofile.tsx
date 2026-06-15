import { Download, Hash, MessageSquare, Pencil, RefreshCw, Users, X } from "lucide-react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

export const ChannelProfile = () => {
  const { channels, channelProfileSlug, agents, projects, chat, channelMessages } = useApp();
  const channel = channelProfileSlug
    ? (channels.find((c) => c.slug === channelProfileSlug) ?? null)
    : null;

  if (!channel) return null;

  const members = channel.agents
    .map((slug) => agents.find((agent) => agent.slug === slug))
    .filter((agent): agent is NonNullable<typeof agent> => agent !== undefined);
  const active = chat.channelSlug === channel.slug;
  const linkedProjects = channel.projects
    .map((slug) => projects.find((project) => project.slug === slug))
    .filter((project): project is NonNullable<typeof project> => project !== undefined);
  const transcript = channelMessages.filter((message) => message.channelSlug === channel.slug);

  const useChannel = () => {
    actions.setChannel(channel.slug);
    actions.openAi();
    actions.closeChannelProfile();
  };

  const editChannel = () => {
    actions.closeChannelProfile();
    void actions.openAgentEditor("channel", channel.slug);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal controls are explicit buttons
    <div className="agentprofile-overlay" onClick={() => actions.closeChannelProfile()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="agentprofile"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="agentprofile-head">
          <div className="agentprofile-avatar">{channel.icon || "\u{1F4AC}"}</div>
          <div className="agentprofile-title">
            <span>Channel profile</span>
            <h2>{channel.name}</h2>
            {channel.description ? <p>{channel.description}</p> : null}
          </div>
          <button
            type="button"
            className="agentprofile-close"
            title="Close"
            onClick={() => actions.closeChannelProfile()}
          >
            <X size={15} />
          </button>
        </header>

        <div className="agentprofile-body">
          <section className="agentprofile-section">
            <h3>
              <Hash size={14} /> Brief
            </h3>
            <p>{channel.brief || "No channel brief has been written yet."}</p>
          </section>

          <div className="agentprofile-meta">
            <div>
              <span>Routing</span>
              <strong>{channel.mode}</strong>
            </div>
            <div>
              <span>Members</span>
              <strong>{members.length}</strong>
            </div>
            <div>
              <span>Context</span>
              <strong>{channel.context.length}</strong>
            </div>
          </div>

          <section className="agentprofile-section">
            <h3>
              <Users size={14} /> Agents
            </h3>
            {members.length > 0 ? (
              <div className="agentprofile-tools">
                {members.map((agent) => (
                  <span key={agent.slug}>
                    {agent.icon} {agent.name}
                  </span>
                ))}
              </div>
            ) : (
              <p>No agents are assigned yet.</p>
            )}
          </section>

          {channel.context.length > 0 ? (
            <section className="agentprofile-section">
              <h3>Context</h3>
              <div className="agentprofile-tools">
                {channel.context.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </section>
          ) : null}

          {linkedProjects.length > 0 ? (
            <section className="agentprofile-section">
              <h3>Projects</h3>
              <div className="agentprofile-tools">
                {linkedProjects.map((project) => (
                  <span key={project.slug}>{project.path}</span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="agentprofile-section">
            <h3>
              <MessageSquare size={14} /> Transcript
              <button
                type="button"
                className="agentprofile-inline"
                title="Refresh transcript"
                onClick={() => void actions.refreshChannelMessages(channel.slug)}
              >
                <RefreshCw size={12} />
              </button>
            </h3>
            {transcript.length > 0 ? (
              <div className="channelprofile-transcript">
                {transcript.slice(-12).map((message) => {
                  const agent = message.agentSlug
                    ? agents.find((item) => item.slug === message.agentSlug)
                    : null;
                  return (
                    <article
                      key={message.id}
                      className="channelprofile-message"
                      data-role={message.role}
                    >
                      <header>
                        <span>{message.role === "user" ? "You" : agent?.name || "Assistant"}</span>
                        <time dateTime={message.createdAt}>
                          {new Date(message.createdAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      </header>
                      <p>{message.content}</p>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p>No transcript has been recorded for this channel yet.</p>
            )}
          </section>
        </div>

        <footer className="agentprofile-foot">
          <button
            type="button"
            className="agentprofile-btn"
            onClick={() => void actions.exportChannel(channel.slug)}
          >
            <Download size={13} /> Export
          </button>
          <button type="button" className="agentprofile-btn" onClick={editChannel}>
            <Pencil size={13} /> Edit source
          </button>
          <button
            type="button"
            className="agentprofile-btn agentprofile-primary"
            disabled={active || members.length === 0}
            onClick={useChannel}
          >
            <MessageSquare size={13} /> {active ? "Active channel" : "Use in chat"}
          </button>
        </footer>
      </div>
    </div>
  );
};
