import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	infiniteQueryOptions,
	invalidateAll,
	invalidateMany,
	invalidateOne,
	load,
	prefetchEntry,
	type QueryClient,
	type QueryHandle,
	useQuery,
	useQueryClient,
} from "@raf-query/react";
import { group } from "@raf-query/react/groups";
import { Suspense, use, useTransition } from "react";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import { formatTime, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
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

const todos = group("todos");
const users = group("users");

interface StringPage {
	readonly items: ReadonlyArray<string>;
	readonly nextCursor: number | null;
}

function pageNext(lastPage: StringPage) {
	return lastPage.nextCursor;
}

function todosQuery(input: { readonly status: Status }) {
	return infiniteQueryOptions({
		getNextPageParam: pageNext,
		initialPageParam: 0,
		queryFn: (context) =>
			server.respond(
				`GET /todos?status=${input.status}`,
				(db) => ({
					items: db.todos
						.filter((todo) => input.status === "all" || todo.done)
						.map((todo) => todo.text),
					nextCursor: null,
				}),
				context,
			),
		queryKey: [todos, "list", input],
		staleTime: Infinity,
	});
}

function usersQuery() {
	return infiniteQueryOptions({
		getNextPageParam: pageNext,
		initialPageParam: 0,
		queryFn: (context) =>
			server.respond(
				"GET /users",
				(db) => ({ items: db.users, nextCursor: null }),
				context,
			),
		queryKey: [users, "list"],
		staleTime: Infinity,
	});
}

interface PageData {
	readonly all: QueryHandle<typeof todosQuery>;
	readonly done: QueryHandle<typeof todosQuery>;
	readonly users: QueryHandle<typeof usersQuery>;
}

function ListCard(props: {
	readonly items: Promise<{
		readonly pages: ReadonlyArray<{ readonly items: ReadonlyArray<string> }>;
	}>;
}) {
	const pages = use(props.items);
	return (
		<ul className="grid gap-1 text-sm">
			{pages.pages
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
	readonly items: Promise<{
		readonly pages: ReadonlyArray<{ readonly items: ReadonlyArray<string> }>;
	}>;
	readonly label: string;
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
				<ListCard items={props.items} />
			</Suspense>
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
	const [items, state] = useQuery(todosQuery, props.handle);
	return (
		<Card
			fetching={state.isFetching}
			items={items}
			label={props.label}
			updatedAt={state.updatedAt}
		/>
	);
}

function UsersCard(props: { readonly handle: QueryHandle<typeof usersQuery> }) {
	const [items, state] = useQuery(usersQuery, props.handle);
	return (
		<Card
			fetching={state.isFetching}
			items={items}
			label='[users, "list"]'
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
					all: prefetchEntry(todosQuery, { status: "all" }),
					done: prefetchEntry(todosQuery, { status: "done" }),
					users: prefetchEntry(usersQuery),
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
