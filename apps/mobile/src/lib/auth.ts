import { Platform } from "react-native";
import { create } from "zustand";
import { mutate } from "swr";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, api, clearTokens, postPublic, saveTokens, setSessionEndedHandler, storedRefreshToken, type TokenResponse } from "@/lib/api";
import { currentPushToken } from "@/lib/push";

// Who's signed in. The root layout shows the sign-in screens, onboarding or the app from `status` and
// `user.onboarded` (src/app/_layout.tsx).

export interface SessionUser {
  id: string;
  email: string | null;
  username: string | null;
  // Has a username and a colour, the web's test for finished onboarding.
  onboarded: boolean;
}

export interface SignInResponse extends TokenResponse {
  isNewUser: boolean;
  user: SessionUser;
}

type Status = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: Status;
  user: SessionUser | null;
  // Where to go once the app (tabs) has mounted, e.g. the choice made at the end of onboarding. Navigating
  // straight away would happen before the root layout swaps onboarding for the app.
  pendingPath: string | null;
  setPendingPath(path: string | null): void;
  restore(): Promise<void>;
  completeSignIn(response: SignInResponse): Promise<void>;
  refreshUser(): Promise<void>;
  signOut(): Promise<void>;
}

const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;

// /api/user is the web's own "who am I", sanitised on the server.
type ApiUser = { id: string; email: string | null; username: string | null; favColour: string | null };
const sessionUserOf = (u: ApiUser): SessionUser => ({ id: u.id, email: u.email, username: u.username, onboarded: !!u.username && !!u.favColour });

// The last signed-in reader, so the app opens offline. Not a secret: the refresh token is what signs in.
const USER_KEY = "bookmark.user";
const rememberUser = (user: SessionUser) => AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
const lastUser = async (): Promise<SessionUser | null> => {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
};

// Forget everything cached for the last account.
const clearCache = async () => {
  await AsyncStorage.removeItem(USER_KEY);
  await mutate(() => true, undefined, { revalidate: false });
};

export const useAuth = create<AuthState>()((set, get) => ({
  status: "loading",
  user: null,
  pendingPath: null,
  setPendingPath: (pendingPath) => set({ pendingPath }),

  async restore() {
    if (!(await storedRefreshToken())) return set({ status: "signedOut", user: null });
    try {
      const user = sessionUserOf(await api.get<ApiUser>("/api/user"));
      await rememberUser(user);
      set({ status: "signedIn", user });
    } catch (error) {
      // The session was ended (signed out elsewhere, account deleted): sign in again.
      if (error instanceof ApiError && error.status === 401) return set({ status: "signedOut", user: null });
      // Offline: carry on as the last reader seen; screens show what SWR has and retry when back online.
      const cached = await lastUser();
      set(cached ? { status: "signedIn", user: cached } : { status: "signedOut", user: null });
    }
  },

  async completeSignIn(response) {
    await saveTokens(response);
    await rememberUser(response.user);
    set({ status: "signedIn", user: response.user });
  },

  async refreshUser() {
    if (get().status !== "signedIn") return;
    const user = sessionUserOf(await api.get<ApiUser>("/api/user"));
    await rememberUser(user);
    set({ user });
  },

  async signOut() {
    const refreshToken = await storedRefreshToken();
    const pushToken = currentPushToken();
    // Best effort: the phone is signed out even if the server can't be reached.
    await postPublic("/api/mobile/auth/sign-out", { refreshToken, pushToken }).catch(() => {});
    await clearTokens();
    await clearCache();
    set({ status: "signedOut", user: null });
  },
}));

setSessionEndedHandler(() => {
  if (useAuth.getState().status === "signedIn") {
    void clearTokens().then(clearCache);
    useAuth.setState({ status: "signedOut", user: null });
  }
});

// ---- Signing in -------------------------------------------------------------------------------

export const signInWithPassword = (email: string, password: string) =>
  postPublic<SignInResponse>("/api/mobile/auth/password", { email, password, platform });

export const requestEmailLink = (email: string) => postPublic<{ sent: true }>("/api/mobile/auth/magic-link", { email });

export const signInWithEmailLink = (email: string, token: string) =>
  postPublic<SignInResponse>("/api/mobile/auth/magic-link/verify", { email, token, platform });

export const signInWithGoogleToken = (idToken: string) => postPublic<SignInResponse>("/api/mobile/auth/google", { idToken, platform });

export const signInWithAppleToken = (identityToken: string, nonce: string, fullName: string | null) =>
  postPublic<SignInResponse>("/api/mobile/auth/apple", { identityToken, nonce, fullName, platform });

// Registration is the web's own route: it emails a confirmation link, and the account signs in once
// that's followed.
export const register = (email: string, password: string) => postPublic<{ resent?: boolean }>("/api/register", { email, password });
