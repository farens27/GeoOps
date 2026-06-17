/**
 * GeoOps Auth Utilities
 *
 * Handles login / logout flows, JWT token storage in localStorage,
 * and helpers for decoding and checking token expiry.
 *
 * All network calls go through the shared `api` client which already
 * attaches the Bearer token header automatically.
 */

import { api } from "./api-client";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Authenticated user profile returned by the backend. */
export type User = {
  id: string;
  username: string;
  role: string;
};

/** Credentials submitted on the login form. */
export type LoginCredentials = {
  username: string;
  password: string;
};

/** Shape of a successful login response from the API. */
type LoginResponse = {
  token: string;
  user: User;
};

/** Decoded JWT payload (only the fields we care about). */
type JWTPayload = {
  sub: string;
  exp: number;
  iat?: number;
  role?: string;
  username?: string;
  [key: string]: unknown;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** localStorage key where the JWT is persisted. */
const TOKEN_KEY = "geoops_token";

/**
 * Safety margin (in seconds) subtracted from `exp` so we treat the
 * token as expired slightly before it truly is. This avoids race
 * conditions where a request is sent just as the token expires.
 */
const EXPIRY_MARGIN_SECONDS = 30;

/* ------------------------------------------------------------------ */
/*  Token helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Read the stored JWT from localStorage.
 * Returns `null` when running server-side or when no token is stored.
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Decode the payload segment of a JWT **without** verifying the
 * signature.  Signature verification is the backend's job — here we
 * just need to peek at `exp` and other claims.
 *
 * Returns `null` if the token is malformed.
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // The payload is the second segment, base64url-encoded.
    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const json = atob(base64);
    return JSON.parse(json) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Check whether a JWT's `exp` claim is in the past (plus a small
 * safety margin).
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload || typeof payload.exp !== "number") return true;

  const nowSeconds = Math.floor(Date.now() / 1_000);
  return nowSeconds >= payload.exp - EXPIRY_MARGIN_SECONDS;
}

/**
 * Returns `true` when a non-expired JWT is present in localStorage.
 * This is a **client-side-only** check — the backend still validates
 * on every request.
 */
export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  return !isTokenExpired(token);
}

/* ------------------------------------------------------------------ */
/*  Auth flows                                                        */
/* ------------------------------------------------------------------ */

/**
 * Authenticate with the backend.
 *
 * On success the JWT is stored in localStorage (picked up
 * automatically by `apiClient` for subsequent requests) and the
 * user profile is returned.
 */
export async function login(credentials: LoginCredentials): Promise<User> {
  const { token, user } = await api.post<LoginResponse>(
    "/api/auth/login",
    credentials
  );

  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
  }

  return user;
}

/**
 * Log out the current user.
 *
 * Tells the backend to invalidate the token (if it tracks sessions),
 * then clears the local copy regardless of whether the request
 * succeeds (network could be down).
 */
export async function logout(): Promise<void> {
  try {
    await api.post<void>("/api/auth/logout", {});
  } finally {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
    }
  }
}

/**
 * Fetch the currently authenticated user's profile.
 *
 * Useful on app startup to rehydrate session state from a stored
 * token that hasn't expired yet.
 */
export async function getMe(): Promise<User> {
  return api.get<User>("/api/auth/me");
}
