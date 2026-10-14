import type { IssueStatus } from "@examples/db/types";
import { Badge } from "@examples/ui/components/badge";
import { cn } from "@examples/ui/lib/utils";

const labels = {
	closed: "Closed",
	in_progress: "In progress",
	open: "Open",
} as const satisfies Record<IssueStatus, string>;

const variants = {
	closed: "violet",
	in_progress: "amber",
	open: "blue",
} as const satisfies Record<IssueStatus, string>;

const dots = {
	all: "bg-brand-gradient",
	closed: "bg-brand-violet",
	in_progress: "bg-brand-amber",
	open: "bg-brand-blue",
} as const satisfies Record<IssueStatus | "all", string>;

export function statusLabel(status: IssueStatus | "all") {
	return status === "all" ? "All" : labels[status];
}

export function StatusBadge(props: { readonly status: IssueStatus }) {
	return <Badge variant={variants[props.status]}>{labels[props.status]}</Badge>;
}

export function StatusDot(props: { readonly status: IssueStatus | "all" }) {
	return (
		<span
			aria-hidden
			className={cn("size-2 rounded-full", dots[props.status])}
		/>
	);
}
