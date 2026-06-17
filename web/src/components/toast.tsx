/**
 * Toast Notification System
 *
 * Provides a global toast store and UI container. Toasts stack in the
 * top-right corner with a slide-in animation and auto-dismiss after 4s.
 *
 * Usage (in any module):
 *   import { showToast } from "~/components/toast";
 *   showToast("Worker saved!", "success");
 *
 * Mount the container once in your root layout:
 *   import { ToastContainer } from "~/components/toast";
 *   <ToastContainer />
 */

import { createSignal, For, onCleanup } from "solid-js";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  /** Track removal animation state */
  exiting: boolean;
}

/* --------------------------------------------------------------------------
   Toast Store (module-level singleton)
   -------------------------------------------------------------------------- */

let nextId = 0;
const [toasts, setToasts] = createSignal<Toast[]>([]);

/** Auto-dismiss timeout in ms */
const AUTO_DISMISS_MS = 4_000;

/** Slide-out duration (must match CSS animation) */
const EXIT_ANIMATION_MS = 300;

/**
 * Show a toast notification.
 * Can be called from any module — no component reference needed.
 */
export function showToast(message: string, type: ToastType = "info"): void {
  const id = nextId++;
  const toast: Toast = { id, message, type, exiting: false };

  setToasts((prev) => [...prev, toast]);

  // Schedule auto-dismiss
  const timer = setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);

  // Clean up timer if toast is removed early (e.g., manual close)
  // We rely on the dismiss function handling both paths.
  void timer; // suppress unused-var in strict mode
}

/**
 * Dismiss a toast by id — triggers exit animation, then removes.
 */
function dismissToast(id: number): void {
  // Mark as exiting to trigger slide-out CSS
  setToasts((prev) =>
    prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
  );

  // Remove from DOM after animation completes
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, EXIT_ANIMATION_MS);
}

/* --------------------------------------------------------------------------
   Emoji icon per toast type
   -------------------------------------------------------------------------- */

const TYPE_ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/**
 * Renders the stack of active toasts. Mount this once in your
 * top-level layout component.
 */
export function ToastContainer() {
  return (
    <div class="toast-container" aria-live="polite">
      <For each={toasts()}>
        {(toast) => (
          <div
            class={`toast toast--${toast.type} ${toast.exiting ? "toast--exit" : ""}`}
            role="alert"
          >
            <span class="toast-icon">{TYPE_ICONS[toast.type]}</span>
            <span class="toast-message">{toast.message}</span>
            <button
              class="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
