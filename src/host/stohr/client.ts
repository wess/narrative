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
