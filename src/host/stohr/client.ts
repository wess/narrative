// A minimal HTTP client for a Stohr instance — just the calls Narrative
// needs to connect and verify an account. Stohr authenticates with an
// `Authorization: Bearer <token>` header (a `stohr_pat_…` personal access
// token or a login JWT). Runs on the host, so it escapes the webview's CORS.

export type StohrUser = {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly username: string;
  readonly is_owner: boolean;
};

export type StohrUsageRaw = {
  readonly quota_bytes: number;
  readonly used_bytes: number;
};

// `POST /login` either signs the user in or, for a 2FA account, hands back
// a short-lived MFA challenge to finish via `POST /login/mfa`.
export type LoginResponse =
  | { readonly token: string }
  | { readonly mfa_required: true; readonly mfa_token: string };

export const normalizeBaseURL = (url: string): string => url.trim().replace(/\/+$/, "");

const request = async <T>(
  baseURL: string,
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> => {
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`${normalizeBaseURL(baseURL)}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Stohr request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data as T;
};

export const stohrLogin = (
  baseURL: string,
  identity: string,
  password: string,
): Promise<LoginResponse> =>
  request<LoginResponse>(baseURL, "/login", { method: "POST", body: { identity, password } });

export const stohrLoginMfa = (
  baseURL: string,
  mfaToken: string,
  code: string,
): Promise<{ token: string }> =>
  request<{ token: string }>(baseURL, "/login/mfa", {
    method: "POST",
    body: { mfa_token: mfaToken, code },
  });

export const stohrMe = (baseURL: string, token: string): Promise<StohrUser> =>
  request<StohrUser>(baseURL, "/me", { token });

export const stohrUsage = (baseURL: string, token: string): Promise<StohrUsageRaw> =>
  request<StohrUsageRaw>(baseURL, "/me/usage", { token });

// --- files & folders ------------------------------------------------------
// The slice of Stohr's storage API the vault sync needs: walk the folder
// tree, transfer file bytes, and propagate deletes. Stohr versions files
// implicitly — re-uploading the same name into the same folder archives the
// prior version — so an upload doubles as both "create" and "update".

export type StohrFolder = {
  readonly id: string;
  readonly name: string;
  readonly parent_id: string | null;
};

export type StohrFile = {
  readonly id: string;
  readonly name: string;
  readonly folder_id: string | null;
  readonly size: number;
  readonly version: number;
};

export const stohrListFolders = (
  baseURL: string,
  token: string,
  parentId: string | null,
): Promise<StohrFolder[]> =>
  request<StohrFolder[]>(
    baseURL,
    parentId ? `/folders?parent_id=${encodeURIComponent(parentId)}` : "/folders",
    { token },
  );

export const stohrCreateFolder = (
  baseURL: string,
  token: string,
  name: string,
  parentId: string | null,
): Promise<StohrFolder> =>
  request<StohrFolder>(baseURL, "/folders", {
    method: "POST",
    token,
    body: { name, parent_id: parentId },
  });

export const stohrListFiles = (
  baseURL: string,
  token: string,
  folderId: string,
): Promise<StohrFile[]> =>
  request<StohrFile[]>(baseURL, `/files?folder_id=${encodeURIComponent(folderId)}`, { token });

export const stohrDeleteFile = (baseURL: string, token: string, fileId: string): Promise<unknown> =>
  request(baseURL, `/files/${encodeURIComponent(fileId)}`, { method: "DELETE", token });

// Download a file's bytes — a raw blob stream, not JSON.
export const stohrDownloadFile = async (
  baseURL: string,
  token: string,
  fileId: string,
): Promise<Uint8Array> => {
  const res = await fetch(
    `${normalizeBaseURL(baseURL)}/files/${encodeURIComponent(fileId)}/download`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Stohr download failed (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
};

// Upload (or, for an existing name in the folder, version) a file. The body
// is `multipart/form-data` — never set `content-type` by hand, `fetch` adds
// the boundary.
export const stohrUploadFile = async (
  baseURL: string,
  token: string,
  folderId: string,
  name: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<StohrFile> => {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), name);
  form.append("folder_id", folderId);
  const res = await fetch(`${normalizeBaseURL(baseURL)}/files`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Stohr upload failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data as StohrFile;
};
