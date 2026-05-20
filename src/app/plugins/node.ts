// Stand-ins for the Node / Electron modules a plugin might
// `require()`. The webview is a WKWebView with no Node integration, so
// anything filesystem- or process-shaped is unavailable. `path` is pure
// string maths so we implement it for real; everything else is a proxy that
// imports fine but throws a clear error the moment it's actually touched —
// so a plugin degrades gracefully instead of failing to load outright.

// --- path (POSIX) ---------------------------------------------------------

const normalizeArray = (parts: string[], allowAboveRoot: boolean): string[] => {
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (allowAboveRoot) out.push("..");
    } else {
      out.push(part);
    }
  }
  return out;
};

const posixNormalize = (path: string): string => {
  const isAbsolute = path.startsWith("/");
  const trailing = path.length > 1 && path.endsWith("/");
  let normalized = normalizeArray(path.split("/"), !isAbsolute).join("/");
  if (!normalized && !isAbsolute) normalized = ".";
  if (normalized && trailing) normalized += "/";
  return (isAbsolute ? "/" : "") + normalized;
};

export const pathShim = {
  sep: "/",
  delimiter: ":",
  normalize: posixNormalize,
  isAbsolute: (path: string): boolean => path.startsWith("/"),
  join: (...parts: string[]): string => {
    const joined = parts.filter((p) => p && p.length > 0).join("/");
    return joined ? posixNormalize(joined) : ".";
  },
  resolve: (...parts: string[]): string => {
    let resolved = "";
    let isAbsolute = false;
    for (let i = parts.length - 1; i >= 0 && !isAbsolute; i--) {
      const part = parts[i];
      if (!part) continue;
      resolved = `${part}/${resolved}`;
      isAbsolute = part.startsWith("/");
    }
    const normalized = normalizeArray(resolved.split("/"), !isAbsolute).join("/");
    return isAbsolute ? `/${normalized}` : normalized || ".";
  },
  dirname: (path: string): string => {
    const idx = path.replace(/\/+$/, "").lastIndexOf("/");
    if (idx < 0) return ".";
    if (idx === 0) return "/";
    return path.slice(0, idx);
  },
  basename: (path: string, ext?: string): string => {
    const base = path.replace(/\/+$/, "").split("/").pop() ?? "";
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
  },
  extname: (path: string): string => {
    const base = path.split("/").pop() ?? "";
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(dot) : "";
  },
  parse: (path: string) => {
    const dir = pathShim.dirname(path);
    const base = pathShim.basename(path);
    const ext = pathShim.extname(base);
    return {
      root: path.startsWith("/") ? "/" : "",
      dir,
      base,
      ext,
      name: base.slice(0, base.length - ext.length),
    };
  },
  relative: (from: string, to: string): string => {
    const f = normalizeArray(from.split("/"), false);
    const t = normalizeArray(to.split("/"), false);
    let i = 0;
    while (i < f.length && i < t.length && f[i] === t[i]) i++;
    return [...f.slice(i).map(() => ".."), ...t.slice(i)].join("/") || ".";
  },
};

// --- electron -------------------------------------------------------------
// A best-effort shim. WKWebView can't offer Electron's synchronous clipboard
// or `remote` module; we cover the calls that have a sane web equivalent.

export const electronShim = {
  shell: {
    openExternal: async (url: string): Promise<void> => {
      window.open(url, "_blank", "noopener");
    },
    openPath: async (): Promise<string> => "",
  },
  clipboard: {
    writeText: (text: string): void => {
      void navigator.clipboard?.writeText(text);
    },
    readText: (): string => "", // Electron's is synchronous; the web API isn't
  },
  // `remote` and `ipcRenderer` have no web equivalent — fail loudly on use.
  get remote(): never {
    throw new Error("electron.remote is not available to Narrative plugins.");
  },
  get ipcRenderer(): never {
    throw new Error("electron.ipcRenderer is not available to Narrative plugins.");
  },
};

// --- everything else ------------------------------------------------------

export const missingModule = (name: string): unknown =>
  new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "__esModule") return false;
        if (prop === Symbol.toPrimitive || prop === Symbol.toStringTag) return undefined;
        throw new Error(
          `The "${name}" module isn't available to Narrative plugins — the webview has no Node integration.`,
        );
      },
    },
  );
