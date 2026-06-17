/**
 * ConfirmDialog — Modal Confirmation
 *
 * Centered modal with a dark overlay backdrop. Supports "danger" and
 * "warning" variants which change the confirm button style.
 *
 * Usage:
 *   <ConfirmDialog
 *     isOpen={showDelete()}
 *     title="Delete Geofence"
 *     message="This action cannot be undone."
 *     onConfirm={handleDelete}
 *     onCancel={() => setShowDelete(false)}
 *     variant="danger"
 *   />
 */

import { createEffect, onCleanup, Show } from "solid-js";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface ConfirmDialogProps {
  /** Controls visibility */
  isOpen: boolean;
  /** Heading text */
  title: string;
  /** Body message explaining the action */
  message: string;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Callback when user cancels (or presses Escape) */
  onCancel: () => void;
  /** Custom text for the confirm button (default: "Confirm") */
  confirmText?: string;
  /** Visual variant — changes confirm button color */
  variant?: "danger" | "warning";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export default function ConfirmDialog(props: ConfirmDialogProps) {
  /* ---- Escape key handler ---- */
  createEffect(() => {
    if (!props.isOpen) return;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onCancel();
      }
    };

    document.addEventListener("keydown", handleKeydown);

    // Prevent body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = prevOverflow;
    });
  });

  /** Determine confirm button class based on variant */
  const confirmBtnClass = () => {
    switch (props.variant) {
      case "danger":
        return "btn btn-danger";
      case "warning":
        return "btn btn-warning";
      default:
        return "btn btn-primary";
    }
  };

  return (
    <Show when={props.isOpen}>
      {/* Dark overlay — click to cancel */}
      <div class="confirm-overlay" onClick={props.onCancel}>
        {/* Modal card — stop propagation so card clicks don't close */}
        <div
          class="card confirm-dialog"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <h3 id="confirm-title" class="confirm-title">
            {props.title}
          </h3>

          <p class="confirm-message">{props.message}</p>

          <div class="confirm-actions">
            <button class="btn" onClick={props.onCancel}>
              Cancel
            </button>
            <button class={confirmBtnClass()} onClick={props.onConfirm}>
              {props.confirmText ?? "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
