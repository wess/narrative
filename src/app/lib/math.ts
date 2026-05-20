import katex from "katex";

// Render a TeX string to MathML — WebKit renders `<math>` natively, so this
// needs no KaTeX stylesheet or font files. Never throws; shows source on error.
export const renderMath = (tex: string, display: boolean): string => {
  const input = tex.trim();
  try {
    return katex.renderToString(input || (display ? "\\;" : " "), {
      displayMode: display,
      throwOnError: false,
      output: "mathml",
    });
  } catch {
    return `<span class="math-error">${input}</span>`;
  }
};
