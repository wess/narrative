// Image attachments. A pasted or dropped image is written into the vault's
// `attachments/` folder by the host; the page's Markdown stores only the
// vault-relative path (`![](attachments/shot.png)`), so it stays portable.
//
// The webview can't load a vault file path directly, so a relative `src` is
// fetched back over IPC and shown as a `data:` URL. Binary crosses the JSON
// IPC as base64.

import { invoke } from "@basket/ipc/client";
import { useEffect, useState } from "react";
import * as ch from "../../shared/channels.ts";

// A `src` that a browser <img> can load on its own — leave these untouched.
const isExternal = (src: string): boolean => /^(https?:|data:|blob:)/i.test(src);

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("could not read file"));
    reader.readAsDataURL(file);
  });

// Save a pasted/dropped image into the vault. Returns the vault-relative path
// to store in the Markdown, or null if no vault is open.
export const saveImageAttachment = async (file: File): Promise<string | null> => {
  const dataUrl = await fileToDataUrl(file);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const name = file.name || `pasted.${file.type.split("/")[1] ?? "png"}`;
  const { path } = await invoke(ch.saveAttachment, { name, data: base64 });
  return path;
};

// Resolve an image `src` to something an <img> can render. External URLs pass
// through; a vault-relative attachment path is fetched over IPC as a data URL.
export const useAttachmentSrc = (src: string): string => {
  const [resolved, setResolved] = useState(() => (isExternal(src) ? src : ""));
  useEffect(() => {
    if (isExternal(src)) {
      setResolved(src);
      return;
    }
    if (!src) {
      setResolved("");
      return;
    }
    let alive = true;
    void invoke(ch.readAttachment, { path: src }).then((res) => {
      if (alive) setResolved(res ? `data:${res.mime};base64,${res.data}` : "");
    });
    return () => {
      alive = false;
    };
  }, [src]);
  return resolved;
};

// Resolve every vault-relative <img> inside a rendered-Markdown container.
// Used after `innerHTML` is set, where there's no React to host a hook.
export const resolveAttachmentImages = (root: HTMLElement): void => {
  for (const img of root.querySelectorAll("img")) {
    const raw = img.getAttribute("src") ?? "";
    if (!raw || isExternal(raw)) continue;
    void invoke(ch.readAttachment, { path: raw }).then((res) => {
      if (res) img.src = `data:${res.mime};base64,${res.data}`;
    });
  }
};
