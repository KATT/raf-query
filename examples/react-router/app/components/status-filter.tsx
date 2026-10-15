import {
	type IssueListInput,
	issueSorts,
	issueStatuses,
} from "@examples/db/types";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { cn } from "@examples/ui/lib/utils";
import { use } from "react";
import { Link } from "react-router";

import { issueCountsQuery } from "~/queries.ts";

import { statusLabel } from "./status-badge.tsx";

function issuesSearch(input: IssueListInput) {
	const params = new URLSearchParams();
	if (input.status !== "all") {
		params.set("status", input.status);
	}
	if (input.sort !== "newest") {
		params.set("sort", input.sort);
	}
	const search = params.toString();
	return search ? `?${search}` : "";
}

export function StatusFilter(props: {
	readonly counts: QueryHandle<typeof issueCountsQuery>;
	readonly current: IssueListInput;
}) {
	const [countsPromise] = useQuery(issueCountsQuery, props.counts);
	const counts = use(countsPromise);
	const current = props.current;

	return (
		<aside className="grid content-start gap-3 md:gap-6">
			<nav className="flex flex-wrap gap-1 md:grid">
				{(["all", ...issueStatuses] as const).map((status) => (
					<Link
						className={cn(
							"flex justify-between gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted",
							current.status === status && "bg-muted font-medium",
						)}
						key={status}
						to={`/issues${issuesSearch({ ...current, status })}`}
					>
						{statusLabel(status)}
						<span className="text-muted-foreground">{counts[status]}</span>
					</Link>
				))}
			</nav>
			<nav className="flex flex-wrap items-center gap-1 md:grid">
				<span className="px-3 text-xs font-medium text-muted-foreground uppercase">
					Sort
				</span>
				{issueSorts.map((sort) => (
					<Link
						className={cn(
							"rounded-md px-3 py-1.5 text-sm capitalize hover:bg-muted",
							current.sort === sort && "bg-muted font-medium",
						)}
						key={sort}
						to={`/issues${issuesSearch({ ...current, sort })}`}
					>
						{sort}
					</Link>
				))}
			</nav>
		</aside>
	);
}
