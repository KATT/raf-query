import { cn } from "@examples/ui/lib/utils";

import type { FakeServer, RequestStatus } from "./server.ts";
import { useNow, useRequests } from "./stores.ts";

const barColors = {
	aborted: "bg-muted-foreground/40",
	error: "bg-destructive",
	pending: "bg-sky-500 animate-pulse",
	success: "bg-emerald-500",
} satisfies Record<RequestStatus, string>;

const statusLabels = {
	aborted: "aborted",
	error: "failed",
	pending: "…",
	success: "200",
} satisfies Record<RequestStatus, string>;

function seconds(ms: number) {
	return `${(ms / 1000).toFixed(2)}s`;
}

/** The fake server's requests as a waterfall, like the browser's network tab. */
export function NetworkPanel(props: { readonly server: FakeServer<unknown> }) {
	const requests = useRequests(props.server);
	const pending = requests.some((request) => request.status === "pending");
	const now = useNow(pending ? 50 : 1000);
	const first = requests[0];
	if (!first) {
		return (
			<p className="py-6 text-center text-xs text-muted-foreground">
				No requests yet. Requests the demo sends show up here.
			</p>
		);
	}
	const start = first.startedAt;
	const end = Math.max(
		...requests.map(
			(request) => request.endedAt ?? Math.max(now, request.startedAt),
		),
		start + 1000,
	);
	const span = end - start;
	return (
		<ol aria-label="Requests" className="grid gap-1 font-mono text-[11px]">
			{requests.map((request) => {
				const finished = request.endedAt ?? Math.max(now, request.startedAt);
				return (
					<li
						className="grid grid-cols-[minmax(0,10rem)_3.5rem_1fr] items-center gap-2"
						key={request.id}
					>
						<span className="truncate" title={request.label}>
							{request.label}
						</span>
						<span
							className={cn(
								"text-right tabular-nums",
								request.status === "error" && "text-destructive",
								request.status === "aborted" && "text-muted-foreground",
							)}
						>
							{request.status === "pending"
								? seconds(finished - request.startedAt)
								: statusLabels[request.status]}
						</span>
						<span className="relative h-3 rounded-sm bg-muted">
							<span
								className={cn(
									"absolute inset-y-0 rounded-sm",
									barColors[request.status],
								)}
								style={{
									left: `${((request.startedAt - start) / span) * 100}%`,
									width: `${Math.max(((finished - request.startedAt) / span) * 100, 0.75)}%`,
								}}
								title={`${seconds(request.startedAt - start)} → ${seconds(finished - start)}`}
							/>
						</span>
					</li>
				);
			})}
		</ol>
	);
}
