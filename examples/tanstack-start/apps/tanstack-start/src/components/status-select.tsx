import { api, parseResponse } from "~/api.ts";
import { type IssueStatus, issueStatuses } from "@examples/db/types";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@examples/ui/components/dropdown-menu";
import { warnMockDbWrite } from "@examples/kit/lib/mock-db-toast";
import { cn } from "@examples/ui/lib/utils";
import { useQueryClient } from "@raf-query/react";
import { Check } from "lucide-react";
import { useOptimistic, useTransition } from "react";

import { StatusBadge, StatusDot, statusLabel } from "./status-badge.tsx";

/** Status badge that opens a menu and saves the choice optimistically. */
export function StatusSelect(props: {
	readonly align?: "start" | "center" | "end";
	readonly className?: string;
	readonly issueId: number;
	readonly status: IssueStatus;
}) {
	const queryClient = useQueryClient();
	const [status, setOptimisticStatus] = useOptimistic(props.status);
	const [isPending, startTransition] = useTransition();

	function select(next: IssueStatus) {
		if (next === props.status) {
			return;
		}
		startTransition(async () => {
			warnMockDbWrite();
			setOptimisticStatus(next);
			await parseResponse(
				api.issues[":id"].$patch({
					json: { status: next },
					param: { id: String(props.issueId) },
				}),
			);
			await queryClient.invalidate({ queryKey: ["issues"] });
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
						onClick={() => {
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
