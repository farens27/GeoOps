/**
 * GeoOps UI Components — Barrel Export
 *
 * Re-exports all reusable components from a single entry point.
 *
 * Usage:
 *   import { Navbar, StatCard, DataTable } from "~/components";
 */

export { default as Navbar } from "./navbar";
export type { NavbarProps } from "./navbar";

export { default as AuthGuard } from "./auth-guard";

export { default as StatCard } from "./stat-card";
export type { StatCardProps } from "./stat-card";

export { ToastContainer, showToast } from "./toast";
export type { ToastType } from "./toast";

export { default as ConfirmDialog } from "./confirm-dialog";
export type { ConfirmDialogProps } from "./confirm-dialog";

export { default as StatusBadge } from "./status-badge";
export type { BadgeStatus, StatusBadgeProps } from "./status-badge";

export { default as DataTable } from "./data-table";
export type { Column, DataTableProps } from "./data-table";
