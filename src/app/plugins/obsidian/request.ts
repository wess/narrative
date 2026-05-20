// `requestUrl` / `request` — the plugin API's CORS-free HTTP. A WKWebView is bound
// by the same-origin policy, so the actual fetch runs on the host process
// (see `src/host/plugins/index.ts`) and we marshal the result back here.

import { invoke } from "@basket/ipc/client";
import * as ch from "../../../shared/channels.ts";

export type RequestUrlParam = {
  url: string;
  method?: string;
  contentType?: string;
  body?: string | ArrayBuffer;
  headers?: Record<string, string>;
  throw?: boolean;
};

export type RequestUrlResponse = {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly arrayBuffer: ArrayBuffer;
  readonly json: unknown;
  readonly text: string;
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  if (!base64) return new ArrayBuffer(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const bodyToString = (body?: string | ArrayBuffer): string | undefined => {
  if (body === undefined) return undefined;
  if (typeof body === "string") return body;
  return new TextDecoder().decode(body);
};

const normalizeParam = (request: string | RequestUrlParam): RequestUrlParam =>
  typeof request === "string" ? { url: request } : request;

export const requestUrl = async (
  request: string | RequestUrlParam,
): Promise<RequestUrlResponse> => {
  const param = normalizeParam(request);
  const result = await invoke(ch.pluginRequestUrl, {
    url: param.url,
    method: param.method,
    headers: param.headers,
    body: bodyToString(param.body),
    contentType: param.contentType,
  });

  if (param.throw !== false && (result.status === 0 || result.status >= 400)) {
    throw new Error(`requestUrl(${param.url}) failed with status ${result.status}`);
  }

  let json: unknown = null;
  try {
    json = result.text ? JSON.parse(result.text) : null;
  } catch {
    json = null;
  }

  return {
    status: result.status,
    headers: result.headers,
    arrayBuffer: base64ToArrayBuffer(result.base64),
    json,
    text: result.text,
  };
};

export const request = async (req: string | RequestUrlParam): Promise<string> => {
  const res = await requestUrl(req);
  return res.text;
};
