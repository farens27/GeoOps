/**
 * AuthGuard — Route Protection Wrapper
 *
 * Wraps page content that requires authentication. On mount it checks
 * the stored JWT and verifies it with the backend. While the check
 * runs, a loading spinner is shown. If the token is missing or invalid
 * the user is redirected to /login.
 *
 * Usage:
 *   <AuthGuard>
 *     <Dashboard />
 *   </AuthGuard>
 */

import { createSignal, onMount, Show } from "solid-js";
import type { ParentProps } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { isAuthenticated, getMe } from "~/lib/auth";
import type { User } from "~/lib/auth";
import Navbar from "~/components/navbar";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export default function AuthGuard(props: ParentProps) {
  const navigate = useNavigate();

  /** Three possible states while checking auth */
  const [checking, setChecking] = createSignal(true);
  const [authorized, setAuthorized] = createSignal(false);
  const [currentUser, setCurrentUser] = createSignal<User | null>(null);

  onMount(async () => {
    // Fast client-side check first — avoids network call when no token
    if (!isAuthenticated()) {
      navigate("/login", { replace: true });
      return;
    }

    // Token exists and isn't expired locally → verify with the backend
    try {
      const user = await getMe();
      setCurrentUser(user);
      setAuthorized(true);
    } catch {
      // Token was rejected by the server (revoked, tampered, etc.)
      navigate("/login", { replace: true });
    } finally {
      setChecking(false);
    }
  });

  return (
    <>
      {/* Spinner shown while verifying the token */}
      <Show when={checking()}>
        <div class="auth-guard-loading">
          <div class="auth-guard-spinner" />
          <p class="auth-guard-text">Verifying session…</p>
        </div>
      </Show>

      {/* Actual page content — only rendered once auth succeeds */}
      <Show when={!checking() && authorized()}>
        <div class="app-layout">
          <Navbar connected={true} user={currentUser()} />
          <main class="main-content" style={{ "margin-left": "var(--sidebar-width)" }}>
            {props.children}
          </main>
        </div>
      </Show>
    </>
  );
}
