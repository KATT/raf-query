import type { IssueStatus } from "@examples/db/types";

const labels = {
	closed: "Closed",
	in_progress: "In progress",
	open: "Open",
} as const satisfies Record<IssueStatus, string>;

export const statusDots = {
	closed: "bg-zinc-400 dark:bg-zinc-500",
	in_progress: "bg-amber-500",
	open: "bg-emerald-500",
} as const satisfies Record<IssueStatus, string>;

export function statusLabel(status: IssueStatus | "all") {
	return status === "all" ? "All" : labels[status];
}
