// `setIcon` / `addIcon` / `getIcon` — the plugin icon API. The icon set
// *is* Lucide, which Bethink already bundles (`lucide-react`), so we render
// the matching Lucide component to a static SVG string once and cache it.
// `addIcon` lets a plugin register its own SVG; unknown names fall back to a
// neutral placeholder so a missing icon never breaks a ribbon button.

import { icons as lucideIcons } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";

// Plugin-registered custom icons: id -> inner SVG markup (paths, etc.).
const customIcons = new Map<string, string>();
// Rendered-SVG cache, keyed by the normalised icon id.
const svgCache = new Map<string, string>();

const FALLBACK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" class="svg-icon"><circle cx="12" cy="12" r="9"/></svg>';

// "lucide-calendar-days" / "calendar-days" -> "CalendarDays"
const toPascal = (name: string): string =>
  name
    .replace(/^lucide-/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

const lucideRegistry = lucideIcons as unknown as Record<
  string,
  React.ComponentType<{ width?: number; height?: number; class?: string }>
>;

const renderLucide = (pascal: string): string | null => {
  const Component = lucideRegistry[pascal];
  if (!Component) return null;
  try {
    return renderToStaticMarkup(
      createElement(Component, { width: 24, height: 24, class: "svg-icon" }),
    );
  } catch {
    return null;
  }
};

const svgFor = (iconId: string): string => {
  const key = iconId.replace(/^lucide-/, "").toLowerCase();
  const cached = svgCache.get(key);
  if (cached !== undefined) return cached;

  let svg: string;
  const custom = customIcons.get(iconId) ?? customIcons.get(key);
  if (custom !== undefined) {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="svg-icon">${custom}</svg>`;
  } else {
    svg = renderLucide(toPascal(iconId)) ?? FALLBACK_SVG;
  }
  svgCache.set(key, svg);
  return svg;
};

// Register a custom icon. `svgContent` is the inner markup of a 0 0 100 100
// SVG, matching the plugin API's contract.
export const addIcon = (iconId: string, svgContent: string): void => {
  customIcons.set(iconId, svgContent);
  svgCache.delete(iconId.replace(/^lucide-/, "").toLowerCase());
};

// Replace `parent`'s contents with the named icon's SVG.
export const setIcon = (parent: HTMLElement, iconId: string): void => {
  parent.empty();
  parent.innerHTML = svgFor(iconId);
  parent.addClass("narrative-plugin-icon");
};

// Build a detached SVGElement for the named icon, or null when unknown.
export const getIcon = (iconId: string): SVGElement | null => {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = svgFor(iconId);
  const svg = wrapper.firstElementChild;
  return svg instanceof SVGElement ? svg : null;
};

export const getIconIds = (): string[] => [
  ...Object.keys(lucideRegistry).map((name) =>
    name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(),
  ),
  ...customIcons.keys(),
];
