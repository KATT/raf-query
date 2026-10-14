import type { IssueStatus } from "@examples/db/types";
import { Badge } from "@examples/ui/components/badge";
import { cn } from "@examples/ui/lib/utils";

const labels = {
	closed: "Closed",
	in_progress: "In progress",
	open: "Open",
} as const satisfies Record<IssueStatus, string>;

const dots = {
	closed: "bg-zinc-400 dark:bg-zinc-500",
	in_progress: "bg-amber-500",
	open: "bg-emerald-500",
} as const satisfies Record<IssueStatus, string>;

export function statusLabel(status: IssueStatus | "all") {
	return status === "all" ? "All" : labels[status];
}

export function StatusBadge(props: { readonly status: IssueStatus }) {
	return (
		<Badge className="gap-1.5" variant="outline">
			<span
				aria-hidden
				className={cn("size-1.5 rounded-full", dots[props.status])}
			/>
			{labels[props.status]}
		</Badge>
	);
}
