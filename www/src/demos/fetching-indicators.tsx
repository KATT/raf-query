import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	group,
	invalidateMany,
	load,
	type QueryHandle,
	swr,
	useIsFetching,
	useQuery,
} from "@raf-query/react";
import { RefreshCw } from "lucide-react";
import { startTransition, use } from "react";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import { queryOptions, useQueryClient } from "~/demo-kit/client.ts";
import { Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const posts = group("posts");

const postId = 1;

const server = createFakeServer(() => ({ requests: 0 }));

const countNames = ["views", "comments", "likes"] as const;
type Count = (typeof countNames)[number];

function countQuery(input: { readonly count: Count }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${postId}/${input.count}/count`,
				(db) => {
					db.requests++;
					return 40 + ((db.requests * 37 + input.count.length * 11) % 60);
				},
				context,
			),
		queryKey: posts(postId, input.count),
		staleTime: Infinity,
	});
}

type PageData = Readonly<Record<Count, QueryHandle<typeof countQuery>>>;

function GlobalIndicator() {
	const fetching = useIsFetching();
	return (
		<div className="flex items-center gap-2 text-xs text-muted-foreground">
			<div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
				<div
					className={cn(
						"absolute inset-y-0 left-0 w-1/3 rounded-full bg-sky-500 transition-opacity",
						fetching > 0
							? "animate-[indeterminate_1s_ease-in-out_infinite] opacity-100"
							: "opacity-0",
					)}
				/>
			</div>
			<span className="w-36 text-right font-mono tabular-nums">
				useIsFetching() = {fetching}
			</span>
		</div>
	);
}

function CountCard(props: {
	readonly count: Count;
	readonly handle: QueryHandle<typeof countQuery>;
}) {
	const [valueThenable, count] = useQuery(countQuery, props.handle);
	const value = use(valueThenable);
	return (
		<section
			aria-busy={count.isFetching}
			className="grid gap-1 rounded-lg border p-3"
		>
			<h4 className="flex items-center justify-between text-xs text-muted-foreground capitalize">
				{props.count}
				{count.isFetching ? <Spinner /> : null}
			</h4>
			<p className="text-2xl font-semibold tabular-nums">{value}</p>
			<Button
				className="justify-self-start"
				disabled={count.isFetching}
				onClick={() => {
					startTransition(async () => {
						await count.refetch();
					});
				}}
				size="xs"
				variant="ghost"
			>
				<RefreshCw /> Refetch
			</Button>
		</section>
	);
}

function PostCounts(props: { readonly data: PageData }) {
	const qc = useQueryClient();
	return (
		<div className="grid gap-3">
			<GlobalIndicator />
			<div className="grid gap-2 sm:grid-cols-3">
				{countNames.map((name) => (
					<CountCard count={name} handle={props.data[name]} key={name} />
				))}
			</div>
			<Button
				className="justify-self-start"
				onClick={() => {
					startTransition(async () => {
						await invalidateMany(qc, countQuery);
					});
				}}
				size="sm"
				variant="outline"
			>
				<RefreshCw /> Invalidate all counts
			</Button>
		</div>
	);
}

function FetchingIndicators() {
	return (
		<DemoBrowser
			fallback={<Skeleton className="h-36 w-full" />}
			initial={{ path: `/posts/${postId}` }}
			loader={async (args): Promise<PageData> => {
				const [handles] = await load(args.client, {
					comments: swr(countQuery, { count: "comments" }),
					likes: swr(countQuery, { count: "likes" }),
					views: swr(countQuery, { count: "views" }),
				});
				return handles;
			}}
		>
			{(route) => <PostCounts data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: FetchingIndicators,
	hint: "Each of the post's counts shows its own isFetching. The optional bar uses useIsFetching for a global count — prefer the router's pending UI for navigations. Refetch one card, or invalidate them all.",
	server,
	title: "isFetching and useIsFetching",
});
