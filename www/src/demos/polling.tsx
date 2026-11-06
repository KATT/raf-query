import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	type DefinedQueryHandle,
	ensureEntry,
	load,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { useState } from "react";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import { formatTime, Segmented, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";
import { group } from "@raf-query/react/groups";

const stats = group("stats");

const server = createFakeServer(() => ({ history: [42] }));

function nextValue(previous: number) {
	return Math.max(
		5,
		Math.min(95, previous + Math.round((Math.random() - 0.5) * 24)),
	);
}

function visitorsQuery(input: { readonly interval: number | false }) {
	return queryOptions({
		meta: { refetchInterval: input.interval },
		queryFn: (context) =>
			server.respond(
				"GET /stats/visitors",
				(db) => {
					db.history = [
						...db.history,
						nextValue(db.history.at(-1) ?? 42),
					].slice(-24);
					return db.history;
				},
				context,
			),
		queryKey: stats("visitors", input.interval),
	});
}

interface PageData {
	readonly visitors: DefinedQueryHandle<typeof visitorsQuery>;
}

type Interval = "1000" | "3000" | "off";

function Visitors(props: {
	readonly handle: DefinedQueryHandle<typeof visitorsQuery>;
}) {
	const [history, visitors] = useQuery(visitorsQuery, props.handle);
	const max = Math.max(...history, 1);
	return (
		<div className="grid gap-3">
			<div className="flex items-baseline gap-3">
				<p className="text-3xl font-semibold tabular-nums">{history.at(-1)}</p>
				<p className="text-sm text-muted-foreground">visitors right now</p>
				<p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
					{visitors.isFetching ? <Spinner /> : null}
					{formatTime(visitors.updatedAt)}
				</p>
			</div>
			<div aria-hidden="true" className="flex h-20 items-end gap-1">
				{history.map((value, index) => (
					<div
						className={cn(
							"flex-1 rounded-t-sm bg-primary/30",
							index === history.length - 1 && "bg-primary",
						)}
						// oxlint-disable-next-line react/no-array-index-key -- bars are positions in a rolling window
						key={index}
						style={{ height: `${(value / max) * 100}%` }}
					/>
				))}
			</div>
		</div>
	);
}

function Polling() {
	const [interval, setPollInterval] = useState<Interval>("1000");
	return (
		<div className="grid gap-3">
			<Segmented
				label="refetchInterval"
				onChange={setPollInterval}
				options={[
					{ label: "1000", value: "1000" },
					{ label: "3000", value: "3000" },
					{ label: "off", value: "off" },
				]}
				value={interval}
			/>
			{/* The interval is the query's input, so each one is its own query. */}
			<DemoBrowser
				fallback={<Skeleton className="h-32 w-full" />}
				initial={{ path: "/dashboard" }}
				key={interval}
				loader={async (args): Promise<PageData> => {
					const [handles] = await load(args.client, {
						visitors: ensureEntry(visitorsQuery, {
							interval: interval === "off" ? false : Number(interval),
						}),
					});
					return handles;
				}}
			>
				{(route) => <Visitors handle={route.data.visitors} />}
			</DemoBrowser>
		</div>
	);
}

export default defineDemo({
	Component: Polling,
	hint: "The chart refetches on the chosen interval while it's on screen. Each interval is the query's input, so each is its own query: switch and watch the last one go inactive and stop polling.",
	server,
	title: "Polling with meta.refetchInterval",
});
