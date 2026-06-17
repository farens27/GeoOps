/**
 * Navbar — Sidebar Navigation
 *
 * Collapsible sidebar with route links, connection status indicator,
 * and user info. On mobile it collapses to a hamburger-triggered overlay.
 *
 * Usage:
 *   <Navbar connected={wsConnected()} user={currentUser()} />
 */

import { createSignal, Show, For, onMount, onCleanup } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import type { User } from "~/lib/auth";
import { logout } from "~/lib/auth";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface NavbarProps {
  /** Whether the WebSocket/API connection is live */
  connected: boolean;
  /** Currently logged-in user (null = not logged in) */
  user: User | null;
}

/** Single navigation link definition */
interface NavLink {
  path: string;
  label: string;
  icon: string;
}

/* --------------------------------------------------------------------------
   Route Config
   -------------------------------------------------------------------------- */

const NAV_LINKS: NavLink[] = [
  { path: "/",          label: "Dashboard",  icon: "📊" },
  { path: "/map",       label: "Live Map",   icon: "🗺️" },
  { path: "/workers",   label: "Workers",    icon: "👷" },
  { path: "/geofences", label: "Geofences",  icon: "⬡"  },
  { path: "/alerts",    label: "Alerts",     icon: "🔔" },
  { path: "/simulate",  label: "Simulator",  icon: "🎮" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export default function Navbar(props: NavbarProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = createSignal(false);

  /* Close mobile menu when route changes */
  let prevPath = location.pathname;
  const checkRouteChange = () => {
    if (location.pathname !== prevPath) {
      prevPath = location.pathname;
      setMobileOpen(false);
    }
  };

  /* Close sidebar on Escape key */
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") setMobileOpen(false);
  };

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeydown);
  });

  /**
   * Check if a nav link is the currently active route.
   * Dashboard "/" only matches exactly; other routes match prefix.
   */
  const isActive = (path: string): boolean => {
    checkRouteChange(); // piggyback on reactive reads
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      {/* ---- Mobile hamburger toggle ---- */}
      <button
        class="navbar-hamburger"
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label="Toggle navigation menu"
      >
        <span class={`hamburger-line ${mobileOpen() ? "open" : ""}`} />
        <span class={`hamburger-line ${mobileOpen() ? "open" : ""}`} />
        <span class={`hamburger-line ${mobileOpen() ? "open" : ""}`} />
      </button>

      {/* ---- Overlay backdrop (mobile only) ---- */}
      <Show when={mobileOpen()}>
        <div
          class="navbar-overlay"
          onClick={() => setMobileOpen(false)}
        />
      </Show>

      {/* ---- Sidebar ---- */}
      <nav class={`navbar-sidebar ${mobileOpen() ? "navbar-sidebar--open" : ""}`}>
        {/* Logo */}
        <div class="navbar-brand">
          <span class="navbar-logo">📍</span>
          <span class="navbar-title">GeoOps</span>
        </div>

        {/* Connection Status */}
        <div class="navbar-status">
          <span
            class={`navbar-status-dot ${props.connected ? "navbar-status-dot--online" : "navbar-status-dot--offline"}`}
          />
          <span class="navbar-status-label">
            {props.connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {/* Navigation Links */}
        <ul class="navbar-links">
          <For each={NAV_LINKS}>
            {(link) => (
              <li>
                <A
                  href={link.path}
                  class={`navbar-link ${isActive(link.path) ? "navbar-link--active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <span class="navbar-link-icon">{link.icon}</span>
                  <span class="navbar-link-label">{link.label}</span>
                </A>
              </li>
            )}
          </For>
        </ul>

        {/* Bottom section: user info + logout */}
        <div class="navbar-footer">
          <Show when={props.user}>
            {(user) => (
              <div class="navbar-user">
                <div class="navbar-user-avatar">
                  {user().username.charAt(0).toUpperCase()}
                </div>
                <div class="navbar-user-info">
                  <span class="navbar-user-name">{user().username}</span>
                  <span class="navbar-user-role">{user().role}</span>
                </div>
              </div>
            )}
          </Show>
          <button class="btn btn-ghost navbar-logout-btn" onClick={handleLogout}>
            🚪 Logout
          </button>
        </div>
      </nav>
    </>
  );
}
