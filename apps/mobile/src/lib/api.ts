import { Platform } from "react-native";
import { API_URL } from "@/lib/config";
import { secureStorage } from "@/lib/secureStorage";

// Every call to the Bookmark API goes through apiFetch. It sends the access token as a bearer token
// (apps/web/lib/mobileAuth.ts) and the phone's time zone (so streak days roll over at the reader's
// midnight), and when the access token has expired it trades the refresh token for new ones once and
// retries. If that fails the session is over: onSessionEnded (lib/auth.ts) signs the app out.

const REFRESH_KEY = "bookmark.refreshToken";

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class ApiError extends Error {
  constructor(public status: number, public body: { error?: string; code?: string } & Record<string, unknown>) {
    super(body?.error || `Request failed (${status})`);
  }
}

export const SUSPENDED = "suspended";
// The server's fallback wording (apps/web/lib/suspension.ts), for a 403 that arrives without it. Normally
// `error` is the whole notice: when the suspension ends, the reason staff gave and the support address.
const SUSPENDED_MESSAGE = "This account is suspended. Email support if you think that's a mistake.";

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
// `message` says why, when the reader should be told (a suspension); a plain expiry passes none.
let onSessionEnded: (message?: string) => void = () => {};

export function setSessionEndedHandler(handler: (message?: string) => void) {
  onSessionEnded = handler;
}

export async function saveTokens(tokens: TokenResponse) {
  accessToken = tokens.accessToken;
  await secureStorage.set(REFRESH_KEY, tokens.refreshToken);
}

export async function clearTokens() {
  accessToken = null;
  await secureStorage.remove(REFRESH_KEY);
}

export const storedRefreshToken = () => secureStorage.get(REFRESH_KEY);

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

// One refresh at a time: requests that fail together wait for the same new token.
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const refreshToken = await storedRefreshToken();
      if (!refreshToken) return false;
      const res = await fetch(`${API_URL}/api/mobile/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await clearTokens();
        return false;
      }
      await saveTokens(await res.json());
      return true;
    } catch {
      // Offline: keep the refresh token for next time.
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function send(path: string, init: RequestInit) {
  const zone = timeZone();
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(init.body !== undefined && !(init.body instanceof FormData) && { "content-type": "application/json" }),
    ...(zone && { "x-time-zone": zone }),
    "x-client": `bookmark-${Platform.OS}`,
    ...(init.headers as Record<string, string> | undefined),
    ...(accessToken && { authorization: `Bearer ${accessToken}` }),
  };
  return fetch(path.startsWith("http") ? path : `${API_URL}${path}`, { ...init, headers });
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!accessToken && (await storedRefreshToken())) await refresh();
  let res = await send(path, init);
  if (res.status === 401 && (await storedRefreshToken())) {
    if (await refresh()) res = await send(path, init);
  }
  if (res.status === 401 && accessToken === null) onSessionEnded();
  // A suspended account (apps/web/lib/suspension.ts): its sessions are already gone on the server, so
  // drop the tokens and sign out rather than waiting for the access token to run out.
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    if (body?.code === SUSPENDED) {
      await clearTokens();
      onSessionEnded(typeof body.error === "string" ? body.error : SUSPENDED_MESSAGE);
    }
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export const api = {
  get: <T>(path: string) => apiFetch(path).then((r) => parse<T>(r)),
  post: <T>(path: string, body?: unknown) => apiFetch(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => parse<T>(r)),
  put: <T>(path: string, body?: unknown) => apiFetch(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => parse<T>(r)),
  patch: <T>(path: string, body: unknown) => apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }).then((r) => parse<T>(r)),
  delete: <T>(path: string, body?: unknown) => apiFetch(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => parse<T>(r)),
};

// SWR's fetcher, the same shape as the web's lib/fetcher.ts: a key is an API path.
export const fetcher = <T>(path: string) => api.get<T>(path);

// Sign-in routes answer without a session, so they skip the bearer and refresh logic.
export async function postPublic<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  return parse<T>(res);
}
