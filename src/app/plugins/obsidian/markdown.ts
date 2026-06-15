// Markdown rendering for plugins: `MarkdownRenderer.render(...)` turns a
// markdown string into DOM (reusing Bethink's own renderer) and then runs
// every registered post-processor over the result — the same pipeline
// Bethink's reading pane uses, so a plugin's processors fire everywhere
// markdown is shown. `MarkdownRenderChild` lets a processor tie DOM it
// created to a component lifecycle.

import { renderMarkdown } from "../../lib/markdown.ts";
import { registry } from "../registry.ts";
import { Component } from "./component.ts";

export type MarkdownPostProcessorContext = {
  docId: string;
  sourcePath: string;
  frontmatter: Record<string, unknown> | null;
  addChild: (child: MarkdownRenderChild) => void;
  getSectionInfo: (el: HTMLElement) => MarkdownSectionInformation | null;
};

export type MarkdownSectionInformation = {
  text: string;
  lineStart: number;
  lineEnd: number;
};

export type MarkdownPostProcessor = (
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => void | Promise<void>;

// A `Component` whose `containerEl` is some DOM a processor produced.
// It's unloaded when the rendered section leaves the view; we unload it when its
// element is removed from the document.
export class MarkdownRenderChild extends Component {
  containerEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    super();
    this.containerEl = containerEl;
  }
}

// Build a default post-processor context for ad-hoc renders.
export const makeContext = (
  sourcePath: string,
  frontmatter: Record<string, unknown> | null = null,
): MarkdownPostProcessorContext => ({
  docId: Math.random().toString(36).slice(2),
  sourcePath,
  frontmatter,
  addChild: (child) => child.load(),
  getSectionInfo: () => null,
});

// Run every registered markdown post-processor + code-block processor over an
// already-rendered element. This is the seam Bethink's own components call
// after `renderMarkdown`.
export const runMarkdownProcessors = async (
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): Promise<void> => {
  // Code blocks first: `<pre><code class="lang-x">` -> processor-owned DOM.
  for (const pre of Array.from(el.querySelectorAll("pre > code"))) {
    const langClass = Array.from(pre.classList).find((c) => c.startsWith("lang-"));
    if (!langClass) continue;
    const language = langClass.slice("lang-".length);
    const proc = registry.codeBlock(language);
    if (!proc) continue;
    const source = pre.textContent ?? "";
    const host = document.createElement("div");
    host.className = `block-language-${language}`;
    const preEl = pre.parentElement;
    preEl?.replaceWith(host);
    try {
      await proc.fn(source, host, ctx);
    } catch (e) {
      console.error(`[narrative] code-block processor "${language}" threw`, e);
      host.setText(`Code block processor "${language}" failed.`);
    }
  }

  for (const proc of registry.postProcessors()) {
    try {
      await proc.fn(el, ctx);
    } catch (e) {
      console.error("[narrative] markdown post-processor threw", e);
    }
  }
};

export const MarkdownRenderer = {
  // Modern signature: render(app, markdown, el, sourcePath, component).
  render: async (
    _app: unknown,
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    _component: Component,
  ): Promise<void> => {
    el.innerHTML = renderMarkdown(markdown);
    el.addClass("markdown-rendered");
    await runMarkdownProcessors(el, makeContext(sourcePath));
  },
  // Deprecated signature kept for older plugins: renderMarkdown(md, el, path, component).
  renderMarkdown: async (
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    _component: Component,
  ): Promise<void> => {
    el.innerHTML = renderMarkdown(markdown);
    el.addClass("markdown-rendered");
    await runMarkdownProcessors(el, makeContext(sourcePath));
  },
};

// `MarkdownPreviewView` — a tiny stand-in. Plugins mostly use it to render a
// preview into an element; we expose just that.
// biome-ignore lint/complexity/noStaticOnlyClass: MarkdownPreviewView is a class in the plugin API
export class MarkdownPreviewView {
  static async render(
    app: unknown,
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: Component,
  ): Promise<void> {
    await MarkdownRenderer.render(app, markdown, el, sourcePath, component);
  }
}
