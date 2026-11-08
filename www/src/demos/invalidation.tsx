import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	group,
	infiniteQueryOptions,
	invalidateAll,
	invalidateMany,
	invalidateOne,
	load,
	prefetch,
	type QueryClient,
	type QueryHandle,
	useInfiniteQuery,
	useQueryClient,
} from "@raf-query/react";
import { Suspense, use, useTransition } from "react";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import { formatTime, LoadMoreButton, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { type ListPage, pageOf } from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

type Status = "all" | "done";

const server = createFakeServer(() => ({
	todos: [
		{ done: true, text: "Start keys with a group" },
		{ done: false, text: "Invalidate the group" },
		{ done: true, text: "Invalidate one query" },
		{ done: false, text: "Match part of the input" },
	],
	users: ["Ada", "Grace", "Linus"],
}));

const pageSize = 2;

const todos = group("todos");
const users = group("users");

function todosQuery(input: { readonly status: Status }) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /todos?status=${input.status}&cursor=${context.pageParam}`,
				(db) =>
					pageOf(
						db.todos
							.filter((todo) => input.status === "all" || todo.done)
							.map((todo) => todo.text),
						context.pageParam,
						pageSize,
					),
				context,
			),
		// After `queryFn`: TypeScript infers the page type from it.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: todos("list", input),
		staleTime: Infinity,
	});
}

function usersQuery() {
	return infiniteQueryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /users?cursor=${context.pageParam}`,
				(db) => pageOf(db.users, context.pageParam, pageSize),
				context,
			),
		// After `queryFn`: TypeScript infers the page type from it.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: users("list"),
		staleTime: Infinity,
	});
}

interface PageData {
	readonly all: QueryHandle<typeof todosQuery>;
	readonly done: QueryHandle<typeof todosQuery>;
	readonly users: QueryHandle<typeof usersQuery>;
}

interface StringPages {
	readonly pages: ReadonlyArray<ListPage<string>>;
}

function ListCard(props: { readonly pagesThenable: Promise<StringPages> }) {
	const data = use(props.pagesThenable);
	return (
		<ul className="grid gap-1 text-sm">
			{data.pages
				.flatMap((page) => page.items)
				.map((item) => (
					<li className="truncate" key={item}>
						{item}
					</li>
				))}
		</ul>
	);
}

function Card(props: {
	readonly fetching: boolean;
	readonly fetchNextPage: () => Promise<void>;
	readonly hasNextPage: boolean;
	readonly isFetchingNextPage: boolean;
	readonly label: string;
	readonly pagesThenable: Promise<StringPages>;
	readonly updatedAt: number;
}) {
	return (
		<section
			aria-busy={props.fetching}
			className={cn(
				"grid content-start gap-2 rounded-lg border p-3 transition-colors",
				props.fetching && "border-sky-500/60 bg-sky-500/5",
			)}
		>
			<h4 className="flex items-center justify-between gap-2 font-mono text-xs">
				{props.label}
				{props.fetching ? <Spinner /> : null}
			</h4>
			<Suspense
				fallback={
					<div className="grid gap-1">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
					</div>
				}
			>
				<ListCard pagesThenable={props.pagesThenable} />
			</Suspense>
			<LoadMoreButton
				fetchNextPage={props.fetchNextPage}
				hasNextPage={props.hasNextPage}
				isFetchingNextPage={props.isFetchingNextPage}
			/>
			<p className="text-[11px] text-muted-foreground tabular-nums">
				{props.updatedAt ? `Fetched ${formatTime(props.updatedAt)}` : "Loading"}
			</p>
		</section>
	);
}

function TodosCard(props: {
	readonly handle: QueryHandle<typeof todosQuery>;
	readonly label: string;
}) {
	const [pagesThenable, state] = useInfiniteQuery(todosQuery, props.handle);
	return (
		<Card
			fetching={state.isFetching}
			fetchNextPage={state.fetchNextPage}
			hasNextPage={state.hasNextPage}
			isFetchingNextPage={state.isFetchingNextPage}
			label={props.label}
			pagesThenable={pagesThenable}
			updatedAt={state.updatedAt}
		/>
	);
}

function UsersCard(props: { readonly handle: QueryHandle<typeof usersQuery> }) {
	const [pagesThenable, state] = useInfiniteQuery(usersQuery, props.handle);
	return (
		<Card
			fetching={state.isFetching}
			fetchNextPage={state.fetchNextPage}
			hasNextPage={state.hasNextPage}
			isFetchingNextPage={state.isFetchingNextPage}
			label='[users, "list"]'
			pagesThenable={pagesThenable}
			updatedAt={state.updatedAt}
		/>
	);
}

const actions: ReadonlyArray<{
	readonly code: string;
	readonly run: (queryClient: QueryClient) => Promise<void>;
}> = [
	{
		code: "invalidateMany(qc, todos)",
		run: (qc) => invalidateMany(qc, todos),
	},
	{
		code: 'invalidateMany(qc, todosQuery, { status: "done" })',
		run: (qc) => invalidateMany(qc, todosQuery, { status: "done" }),
	},
	{
		code: 'invalidateOne(qc, todosQuery, { status: "all" })',
		run: (qc) => invalidateOne(qc, todosQuery, { status: "all" }),
	},
	{ code: "invalidateAll(qc)", run: (qc) => invalidateAll(qc) },
];

function InvalidateButtons() {
	const qc = useQueryClient();
	const [isPending, startTransition] = useTransition();
	return (
		<div className="grid gap-1.5">
			{actions.map((action) => (
				<Button
					className="h-auto justify-start py-1 font-mono text-xs whitespace-normal"
					disabled={isPending}
					key={action.code}
					onClick={() => {
						startTransition(async () => {
							await action.run(qc);
						});
					}}
					size="sm"
					variant="outline"
				>
					{action.code}
				</Button>
			))}
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	return (
		<div className="grid gap-3">
			<div className="grid gap-2 sm:grid-cols-3">
				<TodosCard
					handle={props.data.all}
					label='[todos, "list", { status: "all" }]'
				/>
				<TodosCard
					handle={props.data.done}
					label='[todos, "list", { status: "done" }]'
				/>
				<UsersCard handle={props.data.users} />
			</div>
			<InvalidateButtons />
		</div>
	);
}

function Invalidation() {
	return (
		<DemoBrowser
			fallback={<Skeleton className="h-40 w-full" />}
			initial={{ path: "/dashboard" }}
			loader={async (args): Promise<PageData> => {
				const [handles] = await load(args.client, {
					all: prefetch(todosQuery, { status: "all" }),
					done: prefetch(todosQuery, { status: "done" }),
					users: prefetch(usersQuery),
				});
				return handles;
			}}
		>
			{(route) => <Page data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: Invalidation,
	hint: "Every query here has staleTime: Infinity, so nothing refetches until it's invalidated. Invalidate the todos group, a factory's queries with part of an input, one query, or everything, and see which lists refetch.",
	server,
	title: "Invalidating by group, factory and query",
});
