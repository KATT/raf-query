import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@examples/ui/components/dropdown-menu";
import { warnMockDbWrite } from "@examples/ui/lib/mock-db-toast";
import { cn } from "@examples/ui/lib/utils";
import { QueryCache } from "@raf-query/react";
import { useRouteContext } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Effect } from "effect";
import { useOptimistic, useTransition } from "react";

import { Issues } from "~/issues.ts";
import { type IssueStatus, issueStatuses } from "~/rpc.ts";

import { StatusBadge, StatusDot, statusLabel } from "./status-badge.tsx";

/**
 * Saves the status, then waits for the refetched issues. A failure rejects,
 * so the transition throws to the nearest error boundary.
 */
const setStatus = Effect.fn("setStatus")(function* (input: {
	readonly id: number;
	readonly status: IssueStatus;
}) {
	const issues = yield* Issues;
	const cache = yield* QueryCache.QueryCache;
	yield* issues.SetStatus(input);
	yield* cache.invalidate({ queryKey: ["issues"] });
});

/** Status badge that opens a menu and saves the choice optimistically. */
export function StatusSelect(props: {
	readonly align?: "start" | "center" | "end";
	readonly className?: string;
	readonly issueId: number;
	readonly status: IssueStatus;
}) {
	const queryClient = useRouteContext({
		from: "__root__",
		select: (context) => context.queryClient,
	});
	const [status, setOptimisticStatus] = useOptimistic(props.status);
	const [isPending, startTransition] = useTransition();

	function select(next: IssueStatus) {
		if (next === props.status) {
			return;
		}
		startTransition(async () => {
			warnMockDbWrite();
			setOptimisticStatus(next);
			await queryClient.runPromise(
				setStatus({ id: props.issueId, status: next }),
			);
		});
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`Status: ${statusLabel(status)}. Change status`}
				className={cn(
					"rounded-full outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none",
					isPending && "opacity-60",
					props.className,
				)}
				disabled={isPending}
			>
				<StatusBadge interactive status={status} />
			</DropdownMenuTrigger>
			<DropdownMenuContent align={props.align ?? "end"} className="min-w-40">
				{issueStatuses.map((option) => (
					<DropdownMenuItem
						className="gap-2"
						key={option}
						onSelect={() => {
							select(option);
						}}
					>
						<StatusDot status={option} />
						{statusLabel(option)}
						{option === status ? (
							<Check aria-hidden className="ml-auto size-3.5 opacity-70" />
						) : (
							<span aria-hidden className="ml-auto size-3.5" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
