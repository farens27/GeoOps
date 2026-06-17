/**
 * StatusBadge — Status Indicator Pill
 *
 * Renders a small colored badge that maps to the global.css .badge-*
 * classes. Optionally clickable.
 *
 * Usage:
 *   <StatusBadge status="ACTIVE" />
 *   <StatusBadge status="BREACH" clickable onClick={handleClick} />
 */

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type BadgeStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "ENTERED"
  | "EXITED"
  | "BREACH";

export interface StatusBadgeProps {
  /** Current status to display */
  status: BadgeStatus;
  /** If true, renders as a clickable element with hover effects */
  clickable?: boolean;
  /** Click handler (only fires when clickable is true) */
  onClick?: () => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Maps a status value to the corresponding CSS class name
 * defined in global.css section 8 (Status Badges).
 */
const STATUS_CLASS_MAP: Record<BadgeStatus, string> = {
  ACTIVE:   "badge-active",
  INACTIVE: "badge-inactive",
  ENTERED:  "badge-entered",
  EXITED:   "badge-exited",
  BREACH:   "badge-breach",
};

/** Human-readable labels (title-cased) */
const STATUS_LABEL_MAP: Record<BadgeStatus, string> = {
  ACTIVE:   "Active",
  INACTIVE: "Inactive",
  ENTERED:  "Entered",
  EXITED:   "Exited",
  BREACH:   "Breach",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export default function StatusBadge(props: StatusBadgeProps) {
  const badgeClass = () => {
    const base = `badge ${STATUS_CLASS_MAP[props.status]}`;
    return props.clickable ? `${base} badge--clickable` : base;
  };

  const handleClick = () => {
    if (props.clickable && props.onClick) {
      props.onClick();
    }
  };

  return (
    <span
      class={badgeClass()}
      onClick={handleClick}
      role={props.clickable ? "button" : undefined}
      tabIndex={props.clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (props.clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {STATUS_LABEL_MAP[props.status]}
    </span>
  );
}
