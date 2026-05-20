// Wires the plugin manager onto the IPC surface. The webview drives every
// decision (what's enabled, when to load); the host just owns the bytes on
// disk and the one thing the webview physically can't do — a CORS-free
// `fetch` for the plugin API's `requestUrl`.

import { openFolder } from "@basket/dialog";
import { handle } from "@basket/ipc";
import * as ch from "../../shared/channels.ts";
import type { RequestUrlInput, RequestUrlResult } from "../../shared/types.ts";
import { createPluginStore, type PluginStore } from "./store.ts";

const openInFileManager = (dir: string): void => {
  const cmd =
    process.platform === "darwin"
      ? ["open", dir]
      : process.platform === "win32"
        ? ["explorer", dir]
        : ["xdg-open", dir];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // best-effort — a missing file manager shouldn't throw across IPC
  }
};

const proxyRequest = async (input: RequestUrlInput): Promise<RequestUrlResult> => {
  const headers = { ...(input.headers ?? {}) };
  if (input.contentType && !headers["Content-Type"]) headers["Content-Type"] = input.contentType;
  const res = await fetch(input.url, {
    method: input.method ?? "GET",
    headers,
    body: input.body,
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const outHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    outHeaders[key] = value;
  });
  return {
    status: res.status,
    headers: outHeaders,
    text: new TextDecoder().decode(bytes),
    base64: Buffer.from(bytes).toString("base64"),
  };
};

// `createPluginStore` needs the settings store; the host passes it in.
export const registerPluginHandlers = (store: PluginStore): void => {
  handle(ch.pluginList, () => store.list());
  handle(ch.pluginRead, ({ id }) => store.read(id));
  handle(ch.pluginSetEnabled, ({ id, enabled }) => store.setEnabled(id, enabled));
  handle(ch.pluginSaveData, ({ id, data }) => store.saveData(id, data));
  handle(ch.pluginRemove, ({ id }) => store.remove(id));
  handle(ch.pluginOpenDir, () => openInFileManager(store.root));

  handle(ch.pluginInstall, async () => {
    const picked = await openFolder({ title: "Choose a plugin folder" });
    if (!picked) return { ok: false, message: "" }; // cancelled — no toast
    return store.install(picked);
  });

  handle(ch.pluginRequestUrl, async (input) => {
    try {
      return await proxyRequest(input);
    } catch (e) {
      // Surface the failure as a 0-status response — `requestUrl` callers
      // already branch on status, and this avoids an opaque IPC reject.
      return { status: 0, headers: {}, text: (e as Error).message, base64: "" };
    }
  });
};

export type { PluginStore };
export { createPluginStore };
