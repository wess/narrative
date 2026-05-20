import { createVault } from "@basket/secrets";
import type { Store } from "@basket/store";
import type { StohrAccount, StohrConnectResult, StohrStatus } from "../../shared/types.ts";
import {
  type LoginResponse,
  normalizeBaseURL,
  stohrLogin,
  stohrLoginMfa,
  stohrMe,
  stohrUsage,
} from "./client.ts";

const DEFAULT_BASE_URL = "https://stohr.io/api";
const TOKEN_KEY = "stohr.token";

type Vault = ReturnType<typeof createVault>;

export type StohrRepo = {
  status: () => Promise<StohrStatus>;
  connectToken: (baseURL: string, token: string) => Promise<StohrConnectResult>;
  connectPassword: (
    baseURL: string,
    identity: string,
    password: string,
  ) => Promise<StohrConnectResult>;
  connectMfa: (baseURL: string, mfaToken: string, code: string) => Promise<StohrConnectResult>;
  disconnect: () => Promise<StohrStatus>;
};

// One Stohr connection per app. The bearer token lives in the OS keychain;
// the server URL and a cached account snapshot live in the settings store
// so the connected account shows up even before the first network call.
export const createStohr = (store: Store, appId: string): StohrRepo => {
  const vault: Vault = createVault(appId);

  const baseURL = (): string => store.get<string>("stohr.baseURL") ?? DEFAULT_BASE_URL;
  const cachedAccount = (): StohrAccount | null => store.get<StohrAccount>("stohr.account") ?? null;

  const disconnected = (error: string | null = null): StohrStatus => ({
    connected: false,
    baseURL: baseURL(),
    account: cachedAccount(),
    usage: null,
    error,
  });

  // Confirm the token still works, fetch the account + usage, and cache the
  // account so a later offline open can still show who is signed in.
  const verify = async (url: string, token: string): Promise<StohrStatus> => {
    const user = await stohrMe(url, token);
    const account: StohrAccount = {
      name: user.name,
      email: user.email,
      username: user.username,
      isOwner: user.is_owner,
    };
    store.set("stohr.account", account);

    let usage: StohrStatus["usage"] = null;
    try {
      const u = await stohrUsage(url, token);
      usage = { quotaBytes: u.quota_bytes, usedBytes: u.used_bytes };
    } catch {
      // usage is a nice-to-have — a connection without it is still connected
    }
    return { connected: true, baseURL: url, account, usage, error: null };
  };

  // Verify a freshly obtained token, then persist the connection.
  const persist = async (url: string, token: string): Promise<StohrConnectResult> => {
    try {
      const status = await verify(url, token);
      store.set("stohr.baseURL", url);
      await vault.set(TOKEN_KEY, token);
      return { ok: true, mfaRequired: false, mfaToken: null, status, error: null };
    } catch (e) {
      return {
        ok: false,
        mfaRequired: false,
        mfaToken: null,
        status: disconnected(),
        error: (e as Error).message,
      };
    }
  };

  const failed = (e: unknown): StohrConnectResult => ({
    ok: false,
    mfaRequired: false,
    mfaToken: null,
    status: disconnected(),
    error: (e as Error).message,
  });

  const status = async (): Promise<StohrStatus> => {
    const token = await vault.get(TOKEN_KEY);
    if (!token) return disconnected();
    try {
      return await verify(baseURL(), token);
    } catch (e) {
      // Keep the stored token — a 401 means re-auth, a network blip is transient.
      return disconnected((e as Error).message);
    }
  };

  const connectToken: StohrRepo["connectToken"] = (url, token) =>
    persist(normalizeBaseURL(url), token.trim());

  const connectPassword: StohrRepo["connectPassword"] = async (url, identity, password) => {
    const base = normalizeBaseURL(url);
    try {
      const res: LoginResponse = await stohrLogin(base, identity, password);
      if ("mfa_required" in res) {
        // Right password, 2FA account — the caller resubmits with a code.
        return {
          ok: false,
          mfaRequired: true,
          mfaToken: res.mfa_token,
          status: disconnected(),
          error: null,
        };
      }
      return await persist(base, res.token);
    } catch (e) {
      return failed(e);
    }
  };

  const connectMfa: StohrRepo["connectMfa"] = async (url, mfaToken, code) => {
    const base = normalizeBaseURL(url);
    try {
      const { token } = await stohrLoginMfa(base, mfaToken, code);
      return await persist(base, token);
    } catch (e) {
      return failed(e);
    }
  };

  const disconnect = async (): Promise<StohrStatus> => {
    await vault.delete(TOKEN_KEY);
    store.delete("stohr.account");
    return disconnected();
  };

  return { status, connectToken, connectPassword, connectMfa, disconnect };
};
