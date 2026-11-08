import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	group,
	load,
	type QueryHandle,
	queryOptions,
	swr,
	useQuery,
} from "@raf-query/react";
import { useState, use } from "react";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import { formatTime, Segmented, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const posts = group("posts");

const postId = 1;

const server = createFakeServer(() => ({ history: [42] }));

function nextValue(previous: number) {
	return Math.max(
		5,
		Math.min(95, previous + Math.round((Math.random() - 0.5) * 24)),
	);
}

function readersQuery(input: {
	readonly interval: number | false;
	readonly postId: number;
}) {
	return queryOptions({
		meta: { refetchInterval: input.interval },
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.postId}/readers`,
				(db) => {
					db.history = [
						...db.history,
						nextValue(db.history.at(-1) ?? 42),
					].slice(-24);
					return db.history;
				},
				context,
			),
		queryKey: posts(input.postId, "readers", input.interval),
	});
}

interface PageData {
	readonly readers: QueryHandle<typeof readersQuery>;
}

type Interval = "1000" | "3000" | "off";

function Readers(props: { readonly handle: QueryHandle<typeof readersQuery> }) {
	const [historyThenable, readers] = useQuery(readersQuery, props.handle);
	const history = use(historyThenable);
	const max = Math.max(...history, 1);
	return (
		<div className="grid gap-3">
			<div className="flex items-baseline gap-3">
				<p className="text-3xl font-semibold tabular-nums">{history.at(-1)}</p>
				<p className="text-sm text-muted-foreground">reading this post now</p>
				<p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
					{readers.isFetching ? <Spinner /> : null}
					{formatTime(readers.updatedAt)}
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
				initial={{ path: `/posts/${postId}` }}
				key={interval}
				loader={async (args): Promise<PageData> => {
					const [handles] = await load(args.client, {
						readers: swr(readersQuery, {
							interval: interval === "off" ? false : Number(interval),
							postId,
						}),
					});
					return handles;
				}}
			>
				{(route) => <Readers handle={route.data.readers} />}
			</DemoBrowser>
		</div>
	);
}

export default defineDemo({
	Component: Polling,
	hint: "The post's live reader count refetches on the chosen interval while it's on screen. Each interval is the query's input, so each is its own query: switch and watch the last one go inactive and stop polling.",
	server,
	title: "Polling with meta.refetchInterval",
});
