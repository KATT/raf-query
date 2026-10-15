import { cn } from "@examples/ui/lib/utils";
import type { QueryClient } from "@raf-query/react";

import type { FakeServer, NetworkRequest, RequestStatus } from "./server.ts";
import {
	type CacheRow,
	type DataStatus,
	useCacheRows,
	useRequests,
} from "./stores.ts";

const dataStyles = {
	error: "bg-destructive/15 text-destructive",
	fresh: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	pending: "bg-muted text-muted-foreground",
	stale: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
} satisfies Record<DataStatus, string>;

const requestLabels = {
	aborted: "aborted",
	error: "failed",
	pending: "loading",
	success: "200",
} satisfies Record<RequestStatus, string>;

interface Row {
	/** The cache entry, unless it was removed or the row is a write. */
	readonly entry: CacheRow | undefined;
	readonly id: string;
	readonly kind: "query" | "write";
	readonly label: string;
	readonly requests: ReadonlyArray<NetworkRequest>;
}

/**
 * One row per query, in the order their first request started, then entries
 * that never sent one (data set by hand). Writes, which no query sent, get a
 * row per label.
 */
function rowsOf(
	entries: ReadonlyArray<CacheRow>,
	requests: ReadonlyArray<NetworkRequest>,
): ReadonlyArray<Row> {
	const byHash = new Map(entries.map((entry) => [entry.hash, entry]));
	const rows = new Map<string, Row>();
	for (const request of requests) {
		const id = request.hash ?? `write:${request.label}`;
		const row = rows.get(id);
		rows.set(
			id,
			row
				? { ...row, requests: [...row.requests, request] }
				: {
						entry: request.hash ? byHash.get(request.hash) : undefined,
						id,
						kind: request.hash ? "query" : "write",
						label: request.hash ?? request.label,
						requests: [request],
					},
		);
	}
	for (const entry of entries) {
		if (!rows.has(entry.hash)) {
			rows.set(entry.hash, {
				entry,
				id: entry.hash,
				kind: "query",
				label: entry.hash,
				requests: [],
			});
		}
	}
	return [...rows.values()];
}

function DataCell(props: { readonly row: Row }) {
	const entry = props.row.entry;
	if (props.row.kind === "write") {
		return <span className="text-muted-foreground">write</span>;
	}
	if (!entry) {
		return <span className="text-muted-foreground">removed</span>;
	}
	return (
		<span className={cn("rounded px-1.5 py-0.5", dataStyles[entry.data])}>
			{entry.data === "pending" ? "none" : entry.data}
		</span>
	);
}

function ReadersCell(props: { readonly row: Row }) {
	const entry = props.row.entry;
	if (!entry) {
		return null;
	}
	return entry.observers > 0 ? (
		<span>{entry.observers} reading</span>
	) : (
		<span className="text-muted-foreground">inactive</span>
	);
}

function RequestsCell(props: { readonly row: Row }) {
	const last = props.row.requests.at(-1);
	const loading =
		props.row.entry?.isFetching === true || last?.status === "pending";
	if (!last && !loading) {
		return <span className="text-muted-foreground">none</span>;
	}
	const failures = props.row.entry?.failureCount ?? 0;
	return (
		<span className="flex items-center gap-1.5">
			<span className="text-muted-foreground tabular-nums">
				{props.row.requests.length}×
			</span>
			{loading ? (
				<span className="animate-pulse rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">
					loading{failures > 0 ? ` · ${failures} failed` : ""}
				</span>
			) : last ? (
				<span
					className={cn(
						last.status === "error" && "text-destructive",
						last.status === "aborted" && "text-muted-foreground",
					)}
				>
					{requestLabels[last.status]}
				</span>
			) : null}
		</span>
	);
}

/**
 * What the demo's cache holds and what it asked the server for, one row per
 * query: its data, whether anything reads it, and its requests.
 */
export function QueriesPanel(props: {
	readonly client: QueryClient<unknown>;
	readonly server: FakeServer<unknown>;
}) {
	const entries = useCacheRows(props.client);
	const requests = useRequests(props.server);
	const rows = rowsOf(entries, requests);
	if (rows.length === 0) {
		return (
			<p className="py-6 text-center text-xs text-muted-foreground">
				Nothing cached and no requests yet.
			</p>
		);
	}
	return (
		<table
			aria-label="Queries"
			className="w-full table-fixed font-mono text-[11px]"
		>
			<thead className="text-left text-muted-foreground">
				<tr>
					<th className="pb-1 font-normal">Query</th>
					<th className="w-20 pb-1 font-normal">Data</th>
					<th className="w-22 pb-1 font-normal">Readers</th>
					<th className="w-36 pb-1 font-normal">Requests</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr className="border-t" key={row.id}>
						<td
							className={cn(
								"max-w-0 truncate py-1 pr-2",
								!row.entry && "text-muted-foreground",
							)}
							title={[row.label, row.requests.at(-1)?.label]
								.filter(Boolean)
								.join("\n")}
						>
							{row.label}
						</td>
						<td className="py-1 pr-2 whitespace-nowrap">
							<DataCell row={row} />
						</td>
						<td className="py-1 pr-2 whitespace-nowrap">
							<ReadersCell row={row} />
						</td>
						<td className="py-1 whitespace-nowrap">
							<RequestsCell row={row} />
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
