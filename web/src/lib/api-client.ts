/**
 * GeoOps API Client
 *
 * Thin fetch wrapper that handles JSON serialization, JWT auth headers,
 * and error normalization. Talks to the Phoenix backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Generic fetch wrapper for API calls.
 * Automatically serializes body as JSON, attaches auth token from
 * localStorage, and parses the response.
 *
 * @throws Error with server-provided message on non-2xx responses
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  // Attach JWT if present
  const token =
    typeof window !== "undefined" ? localStorage.getItem("geoops_token") : null;

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    credentials: "include",
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || "Request failed");
  }

  // 204 No Content → nothing to parse
  if (response.status === 204) return undefined as T;

  return response.json();
}

/* ---- Convenience helpers ---- */

export const api = {
  get: <T>(endpoint: string, headers?: Record<string, string>) =>
    apiClient<T>(endpoint, { headers }),

  post: <T>(endpoint: string, body: unknown, headers?: Record<string, string>) =>
    apiClient<T>(endpoint, { method: "POST", body, headers }),

  put: <T>(endpoint: string, body: unknown, headers?: Record<string, string>) =>
    apiClient<T>(endpoint, { method: "PUT", body, headers }),

  patch: <T>(endpoint: string, body: unknown, headers?: Record<string, string>) =>
    apiClient<T>(endpoint, { method: "PATCH", body, headers }),

  delete: <T>(endpoint: string, headers?: Record<string, string>) =>
    apiClient<T>(endpoint, { method: "DELETE", headers }),
};
