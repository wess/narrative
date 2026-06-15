import { FileText, GitCompare, RefreshCw, ShieldCheck, Square, Terminal, X } from "lucide-react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

const formatRunTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const ProjectInspector = () => {
  const { projectInspector, projects } = useApp();
  if (!projectInspector) return null;

  const { projectSlug, projectName, path, file, diff, analysis, changed, runs, loading } =
    projectInspector;
  const project = projects.find((item) => item.slug === projectSlug) ?? null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes via click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal controls are explicit buttons
    <div className="projectinspector-overlay" onClick={() => actions.closeProjectInspector()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog controls are explicit buttons */}
      <div
        className="projectinspector"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="projectinspector-head">
          <div>
            <span>Project</span>
            <h2>{projectName}</h2>
            <p>{path ?? "File changes and command history"}</p>
          </div>
          <div className="projectinspector-actions">
            <button
              type="button"
              title="Refresh"
              onClick={() => void actions.refreshProjectInspector()}
            >
              <RefreshCw size={14} />
            </button>
            <button type="button" title="Close" onClick={() => actions.closeProjectInspector()}>
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="projectinspector-body">
          <section className="projectinspector-main">
            <div className="projectinspector-sectionhead">
              <h3>
                <FileText size={14} />
                {path ? "File" : "Project activity"}
              </h3>
              {loading ? <span>Loading</span> : null}
            </div>
            {path ? (
              file ? (
                <pre className="projectinspector-code">{file.content || " "}</pre>
              ) : (
                <p className="projectinspector-empty">
                  {loading ? "Opening file..." : "This file could not be read."}
                </p>
              )
            ) : (
              <p className="projectinspector-empty">
                Select a file in the project tree to inspect its content and latest snapshot diff.
              </p>
            )}

            {path ? (
              <div className="projectinspector-diff">
                <div className="projectinspector-sectionhead">
                  <h3>
                    <GitCompare size={14} />
                    Latest changes
                  </h3>
                </div>
                {diff ? (
                  <pre className="projectinspector-code projectinspector-code-diff">
                    {diff.diff}
                  </pre>
                ) : (
                  <p className="projectinspector-empty">
                    {loading
                      ? "Checking snapshots..."
                      : "No saved before-and-after view is available for this file."}
                  </p>
                )}
              </div>
            ) : null}
          </section>

          <aside className="projectinspector-side">
            {project ? (
              <section>
                <div className="projectinspector-sectionhead">
                  <h3>
                    <ShieldCheck size={14} />
                    Agent permissions
                  </h3>
                </div>
                <div className="projectinspector-perms">
                  <label>
                    <input
                      type="checkbox"
                      checked={project.allowRead}
                      onChange={(event) =>
                        void actions.updateProjectPermissions(project.slug, {
                          allowRead: event.currentTarget.checked,
                        })
                      }
                    />
                    Read files
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={project.allowWrite}
                      onChange={(event) =>
                        void actions.updateProjectPermissions(project.slug, {
                          allowWrite: event.currentTarget.checked,
                        })
                      }
                    />
                    Write files
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={project.allowRun}
                      onChange={(event) =>
                        void actions.updateProjectPermissions(project.slug, {
                          allowRun: event.currentTarget.checked,
                        })
                      }
                    />
                    Run commands
                  </label>
                </div>
              </section>
            ) : null}

            {analysis ? (
              <section>
                <div className="projectinspector-sectionhead">
                  <h3>
                    <ShieldCheck size={14} />
                    Project setup
                  </h3>
                  <span>{analysis.packageManager ?? "manual"}</span>
                </div>
                <div className="projectinspector-setup">
                  {analysis.stack.length > 0 ? (
                    <div className="projectinspector-tags">
                      {analysis.stack.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  ) : null}
                  {analysis.recommendedCommands.length > 0 ? (
                    <>
                      <div className="projectinspector-minilabel">Detected safe commands</div>
                      <div className="projectinspector-commandlist">
                        {analysis.recommendedCommands.map((command) => (
                          <code key={command}>{command}</code>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="projectinspector-empty">No safe project commands detected yet.</p>
                  )}
                  {analysis.approvedCommands.length > 0 ? (
                    <>
                      <div className="projectinspector-minilabel">Approved for agents</div>
                      <div className="projectinspector-commandlist">
                        {analysis.approvedCommands.map((command) => (
                          <code key={command}>{command}</code>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="projectinspector-warning">
                      No commands are approved for agent runs.
                    </p>
                  )}
                  {analysis.warnings.map((warning) => (
                    <p key={warning} className="projectinspector-warning">
                      {warning}
                    </p>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <div className="projectinspector-sectionhead">
                <h3>
                  <GitCompare size={14} />
                  Changed files
                </h3>
                <span>{changed.length}</span>
              </div>
              <div className="projectinspector-list">
                {changed.length > 0 ? (
                  changed.map((item) => (
                    <button
                      type="button"
                      key={`${item.path}-${item.latestSnapshotId}`}
                      data-active={item.path === path}
                      title={item.path}
                      onClick={() => void actions.openProjectInspector(projectSlug, item.path)}
                    >
                      <span>{item.path}</span>
                      <small>{formatRunTime(item.changedAt)}</small>
                    </button>
                  ))
                ) : (
                  <p className="projectinspector-empty">No saved file changes yet.</p>
                )}
              </div>
            </section>

            <section>
              <div className="projectinspector-sectionhead">
                <h3>
                  <Terminal size={14} />
                  Command runs
                </h3>
                <span>{runs.length}</span>
              </div>
              <div className="projectinspector-runs">
                {runs.length > 0 ? (
                  runs.map((run) => (
                    <details key={run.id}>
                      <summary>
                        <span>{run.command}</span>
                        <small>{run.exitCode === null ? "running" : `exit ${run.exitCode}`}</small>
                      </summary>
                      <div className="projectinspector-runmeta">
                        {formatRunTime(run.createdAt)} · {run.durationMs}ms
                      </div>
                      {run.exitCode === null ? (
                        <button
                          type="button"
                          className="projectinspector-stop"
                          onClick={() => void actions.cancelProjectRun(run.id)}
                        >
                          <Square size={12} />
                          Stop command
                        </button>
                      ) : null}
                      {run.stdout ? <pre>{run.stdout}</pre> : null}
                      {run.stderr ? <pre>{run.stderr}</pre> : null}
                    </details>
                  ))
                ) : (
                  <p className="projectinspector-empty">No project commands have been run yet.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};
