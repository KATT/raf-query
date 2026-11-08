"use client";

import type { QueryClient } from "@raf-query/core";
import {
	type Entry,
	fetchEntry,
	type LoadRecord,
	loadsOf,
	remove,
	reset,
} from "@raf-query/core/internal";
import {
	type CSSProperties,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";

import { useOptionalQueryClient } from "./provider.tsx";

/**
 * Props of {@link QueryDevtoolsPanel}.
 *
 * @see https://raf-query.katt.dev/docs/devtools#props
 */
export interface QueryDevtoolsPanelProps {
	/** The client to inspect. Default: the nearest `QueryClientProvider`'s. */
	readonly client?: QueryClient;
	/** Shows a close button that calls this. */
	readonly onClose?: () => void;
	/** Styles for the panel's root element, e.g. its height. */
	readonly style?: CSSProperties;
}

/**
 * Props of {@link QueryDevtools}.
 *
 * @see https://raf-query.katt.dev/docs/devtools
 */
export interface QueryDevtoolsProps {
	/** Corner of the toggle button. Default: `"bottom-right"`. */
	readonly buttonPosition?:
		| "bottom-left"
		| "bottom-right"
		| "top-left"
		| "top-right";
	/** The client to inspect. Default: the nearest `QueryClientProvider`'s. */
	readonly client?: QueryClient;
	/** Open on the first render. */
	readonly initialIsOpen?: boolean;
}

interface Row {
	readonly entry: Entry;
	readonly readers: number;
	readonly state: Entry["state"];
	readonly status: keyof typeof colors;
	readonly updatedAt: number;
}

interface Snapshot {
	readonly loads: ReadonlyArray<LoadRecord>;
	readonly rows: ReadonlyArray<Row>;
}

function statusOf(entry: Entry): keyof typeof colors {
	const state = entry.state;
	if (state.isFetching) {
		return "fetching";
	}
	if (state.status === "error") {
		return "error";
	}
	return state.hasData
		? entry.readers.size > 0
			? "active"
			: "inactive"
		: "pending";
}

function snapshotOf(client: QueryClient): Snapshot {
	return {
		loads: loadsOf(client),
		rows: [...client["~entries"].values()]
			.map((entry) => ({
				entry,
				readers: entry.readers.size,
				state: entry.state,
				status: statusOf(entry),
				updatedAt: entry.state.updatedAt,
			}))
			.toSorted((a, b) => a.entry.hash.localeCompare(b.entry.hash)),
	};
}

function snapshotStore(client: QueryClient) {
	let changed = false;
	let snapshot = snapshotOf(client);
	return {
		read: () => {
			if (changed) {
				changed = false;
				snapshot = snapshotOf(client);
			}
			return snapshot;
		},
		subscribe: (onChange: () => void) => {
			// Readers that mounted between the render and this subscription
			// changed the cache without an event this store saw.
			changed = true;
			return client.subscribe(() => {
				changed = true;
				onChange();
			});
		},
	};
}

function useSnapshot(client: QueryClient): Snapshot {
	const store = useMemo(() => snapshotStore(client), [client]);
	return useSyncExternalStore(store.subscribe, store.read, store.read);
}

const colors = {
	active: "#16a34a",
	error: "#dc2626",
	fetching: "#2563eb",
	inactive: "#6b7280",
	pending: "#ca8a04",
} satisfies Record<string, string>;

function Panel(
	props: QueryDevtoolsPanelProps & { readonly client: QueryClient },
) {
	const snapshot = useSnapshot(props.client);
	const [selected, setSelected] = useState<string>();
	const row = snapshot.rows.find(
		(candidate) => candidate.entry.hash === selected,
	);
	return (
		<div
			style={{
				background: "#0b0d12",
				color: "#e5e7eb",
				display: "grid",
				font: "12px/1.4 ui-monospace, monospace",
				gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
				height: 320,
				...props.style,
			}}
		>
			<div style={{ borderRight: "1px solid #1f2937", overflow: "auto" }}>
				<div style={{ display: "flex", gap: 8, padding: 8 }}>
					<strong>Queries ({snapshot.rows.length})</strong>
					{props.onClose ? (
						<button
							onClick={props.onClose}
							style={{ marginLeft: "auto" }}
							type="button"
						>
							Close
						</button>
					) : null}
				</div>
				{snapshot.rows.map((item) => (
					<button
						key={item.entry.hash}
						onClick={() => setSelected(item.entry.hash)}
						style={{
							background:
								item.entry.hash === selected ? "#1f2937" : "transparent",
							border: 0,
							color: "inherit",
							display: "flex",
							font: "inherit",
							gap: 8,
							padding: "4px 8px",
							textAlign: "left",
							width: "100%",
						}}
						type="button"
					>
						<span style={{ color: colors[item.status], minWidth: 64 }}>
							{item.status}
						</span>
						<span style={{ minWidth: 16 }}>{item.readers}</span>
						<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
							{item.entry.hash}
						</span>
					</button>
				))}
				<div style={{ borderTop: "1px solid #1f2937", padding: 8 }}>
					<strong>Loads</strong>
					{snapshot.loads.toReversed().map((record) => (
						<div
							key={
								record.startedAt + record.entries.map((one) => one.hash).join()
							}
						>
							{record.entries
								.map((one) => `${one.name} (${one.kind})`)
								.join(", ")}
						</div>
					))}
				</div>
			</div>
			<div style={{ overflow: "auto", padding: 8 }}>
				{row ? (
					<>
						<div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
							<button
								onClick={() => void fetchEntry(row.entry, { restart: true })}
								type="button"
							>
								Refetch
							</button>
							<button onClick={() => void reset(row.entry)} type="button">
								Reset
							</button>
							<button onClick={() => remove(row.entry)} type="button">
								Remove
							</button>
						</div>
						<div>
							Updated:{" "}
							{row.updatedAt
								? new Date(row.updatedAt).toLocaleTimeString()
								: "never"}
						</div>
						<pre style={{ whiteSpace: "pre-wrap" }}>
							{JSON.stringify(row.state.error ?? row.state.data, null, 2)}
						</pre>
					</>
				) : (
					<div style={{ color: "#6b7280" }}>Select a query</div>
				)}
			</div>
		</div>
	);
}

/**
 * The devtools panel, to place in your own layout.
 *
 * @see https://raf-query.katt.dev/docs/devtools#embedding-the-panel
 */
export function QueryDevtoolsPanel(props: QueryDevtoolsPanelProps) {
	const nearest = useOptionalQueryClient();
	const client = props.client ?? nearest;
	if (!client) {
		throw new Error(
			"QueryDevtoolsPanel: pass `client`, or render it in a QueryClientProvider",
		);
	}
	return <Panel {...props} client={client} />;
}

const corners = {
	"bottom-left": { bottom: 12, left: 12 },
	"bottom-right": { bottom: 12, right: 12 },
	"top-left": { left: 12, top: 12 },
	"top-right": { right: 12, top: 12 },
} satisfies Record<
	NonNullable<QueryDevtoolsProps["buttonPosition"]>,
	CSSProperties
>;

/**
 * A toggle button that opens the devtools panel over the page.
 *
 * @see https://raf-query.katt.dev/docs/devtools
 */
export function QueryDevtools(props: QueryDevtoolsProps) {
	const [open, setOpen] = useState(props.initialIsOpen ?? false);
	const corner = corners[props.buttonPosition ?? "bottom-right"];
	return (
		<>
			{open ? (
				<div
					style={{
						bottom: 0,
						left: 0,
						position: "fixed",
						right: 0,
						zIndex: 99_999,
					}}
				>
					<QueryDevtoolsPanel
						client={props.client}
						onClose={() => setOpen(false)}
					/>
				</div>
			) : (
				<button
					onClick={() => setOpen(true)}
					style={{ ...corner, position: "fixed", zIndex: 99_999 }}
					type="button"
				>
					raf-query
				</button>
			)}
		</>
	);
}
