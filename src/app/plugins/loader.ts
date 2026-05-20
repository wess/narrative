// Evaluates a plugin's CommonJS `main.js`. Plugins ship
// as a single bundled CJS file that does `module.exports = PluginClass` (or
// an esbuild-style `exports.default = PluginClass`). We run it inside a
// `new Function` sandbox with a `require` that resolves `obsidian` to our
// shim and Node/Electron modules to the stand-ins in `node.ts`.

import { electronShim, missingModule, pathShim } from "./node.ts";
import * as obsidianModule from "./obsidian/index.ts";

const builtins: Record<string, () => unknown> = {
  obsidian: () => obsidianModule,
  path: () => pathShim,
  "node:path": () => pathShim,
  electron: () => electronShim,
};

const makeRequire = (): ((id: string) => unknown) => {
  return (id: string): unknown => {
    const make = builtins[id];
    return make ? make() : missingModule(id);
  };
};

// A minimal `process` — esbuild bundles routinely read `process.env.NODE_ENV`.
const processShim = {
  env: { NODE_ENV: "production" } as Record<string, string>,
  platform: "web",
  nextTick: (fn: () => void): void => queueMicrotask(fn),
  cwd: (): string => "/",
};

export type LoadedPlugin = {
  // The plugin's exported class (or whatever it exported as default).
  readonly exported: unknown;
};

// Evaluate `code` and hand back its export. The default export wins when the
// bundle set one (esbuild's `exports.default`); otherwise `module.exports`
// itself is the plugin class.
export const evaluatePlugin = (code: string, id: string): LoadedPlugin => {
  const module: { exports: unknown } = { exports: {} };
  const require = makeRequire();

  const fn = new Function(
    "exports",
    "require",
    "module",
    "process",
    "global",
    "globalThis",
    `${code}\n//# sourceURL=narrative-plugin:${id}/main.js`,
  );
  fn(module.exports, require, module, processShim, globalThis, globalThis);

  const exports = module.exports as { default?: unknown } | unknown;
  const exported =
    exports && typeof exports === "object" && "default" in exports
      ? (exports as { default: unknown }).default
      : module.exports;

  return { exported };
};
