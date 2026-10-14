import { cn } from "@examples/ui/lib/utils";
import type { QueryClient } from "@raf-query/react";

import { type EntryStatus, useCacheRows, useNow } from "./stores.ts";

const statusStyles = {
	error: "bg-destructive/15 text-destructive",
	fetching: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
	fresh: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	inactive: "bg-muted text-muted-foreground",
	stale: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
} satisfies Record<EntryStatus, string>;

function age(ms: number) {
	if (ms < 1000) {
		return "just now";
	}
	return `${Math.floor(ms / 1000)}s ago`;
}

/** What the demo's query cache holds, refreshed as it changes. */
export function CachePanel(props: { readonly client: QueryClient<unknown> }) {
	const rows = useCacheRows(props.client);
	const now = useNow(1000);
	if (rows.length === 0) {
		return (
			<p className="py-6 text-center text-xs text-muted-foreground">
				The cache is empty.
			</p>
		);
	}
	return (
		<table className="w-full font-mono text-[11px]">
			<thead className="text-left text-muted-foreground">
				<tr>
					<th className="pb-1 font-normal">Key</th>
					<th className="pb-1 font-normal">Status</th>
					<th className="pb-1 text-right font-normal" title="Mounted readers">
						Readers
					</th>
					<th className="pb-1 text-right font-normal">Updated</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr className="border-t" key={row.hash}>
						<td className="max-w-0 truncate py-1 pr-2" title={row.hash}>
							{row.hash}
						</td>
						<td className="py-1 pr-2">
							<span
								className={cn(
									"rounded px-1.5 py-0.5",
									statusStyles[row.status],
								)}
							>
								{row.status}
								{row.failureCount > 0 && row.status === "fetching"
									? ` · ${row.failureCount} failed`
									: ""}
							</span>
						</td>
						<td className="py-1 text-right tabular-nums">{row.observers}</td>
						<td className="py-1 text-right text-muted-foreground tabular-nums">
							{row.updatedAt === 0 ? "never" : age(now - row.updatedAt)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
