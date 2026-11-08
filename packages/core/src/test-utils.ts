import {
	QueryClientProvider,
	useInfiniteQuery,
	useQuery,
	type UseQueryOptions,
} from "@raf-query/react";
import {
	act,
	render,
	renderHook,
	type RenderResult,
} from "@testing-library/react";
import { createElement, type ReactNode } from "react";

import type { FocusRefetchMeta } from "./features/focus-refetch/focus-refetch.ts";
import type { PollingMeta } from "./features/polling/polling.ts";
import type { ReconnectRefetchMeta } from "./features/reconnect-refetch/reconnect-refetch.ts";
import {
	type Clock,
	createQueryClient,
	fail,
	group,
	infiniteQueryOptions,
	load,
	type LoadEntry,
	type QueryClient,
	type QueryClientConfig,
	type InfiniteQueryFactory,
	type SingleQueryFactory,
	type QueryHandle,
	type QueryMeta,
	queryOptions,
	revalidate,
	type Target,
	waterfallHandle,
} from "./index.ts";

export interface Issue {
	readonly author: string;
	readonly id: number;
	readonly title: string;
}

interface Timer {
	readonly at: number;
	readonly callback: () => void;
}

interface FakeClock extends Clock {
	advance(ms: number): void;
	readonly timers: number;
}

/** A clock whose timers fire only when the test moves it forward. */
function fakeClock(epoch = 1_000_000): FakeClock {
	let now = epoch;
	const timers = new Set<Timer>();
	return {
		advance(ms) {
			const end = now + ms;
			for (;;) {
				const due = [...timers]
					.filter((timer) => timer.at <= end)
					.toSorted((a, b) => a.at - b.at)[0];
				if (!due) {
					break;
				}
				timers.delete(due);
				now = due.at;
				due.callback();
			}
			now = end;
		},
		clearTimeout(handle) {
			for (const timer of timers) {
				if (timer === handle) {
					timers.delete(timer);
				}
			}
		},
		now: () => now,
		setTimeout(callback, ms) {
			const timer: Timer = { at: now + ms, callback };
			timers.add(timer);
			return timer;
		},
		get timers() {
			return timers.size;
		},
	};
}

export const issues = group("issues");
export const drafts = group(issues, "drafts");
export const users = group("users");
/** Issues by one author, or without a parameter every issue: a `where` target over data. */
export const author: Target<QueryMeta, string | undefined> = {
	where: (query, name) => {
		const issue =
			// SAFETY: the backend's queries hold an issue, a draft string or pages.
			query.data as Partial<Issue> | undefined;
		const by = issue?.author;
		return by !== undefined && (name === undefined || by === name);
	},
};
/** Queries whose `meta` says they're featured: the drafts. */
export const featured: Target = {
	where: (query) => query.meta.featured === true,
};

interface Request {
	fail(error: unknown): void;
	readonly id: number;
	respond(): void;
	readonly signal: AbortSignal;
}

/**
 * An in-memory server whose requests settle only when the test says so, so
 * tests can observe the cache mid-request.
 */
export function createBackend() {
	const store = new Map<number, Issue>([
		[1, { author: "ada", id: 1, title: "First" }],
		[2, { author: "bob", id: 2, title: "Second" }],
		[3, { author: "ada", id: 3, title: "Third" }],
	]);
	const requests: Array<Request> = [];

	function get(id: number, signal: AbortSignal) {
		const deferred = Promise.withResolvers<Issue | undefined>();
		requests.push({
			fail: deferred.reject,
			id,
			respond: () => deferred.resolve(store.get(id)),
			signal,
		});
		return deferred.promise;
	}

	const issueQuery = (input: { readonly id: number }) =>
		queryOptions({
			queryFn: async (context) => {
				const issue = await get(input.id, context.signal);
				return issue ?? fail({ _tag: "NotFound", id: input.id });
			},
			queryKey: issues("byId", input),
		});

	const draftQuery = (input: { readonly id: number }) =>
		queryOptions({
			meta: { featured: true },
			queryFn: async (context) =>
				JSON.stringify(await get(input.id, context.signal)),
			queryKey: drafts("byId", input),
		});

	const pageQuery = (input: { readonly size: number }) =>
		infiniteQueryOptions({
			getNextPageParam: (page: ReadonlyArray<number>) => {
				const last = Math.max(...page);
				return last < 9 ? last + 1 : undefined;
			},
			initialPageParam: 0,
			queryFn: async (context) => {
				await get(context.pageParam, context.signal);
				return Array.from(
					{ length: input.size },
					(_, index) => context.pageParam + index,
				);
			},
			queryKey: issues("pages", input),
		});

	return {
		draftQuery,
		issueQuery,
		pageQuery,
		requests,
		/** Settle every open request, and let what they started run. */
		async respondAll() {
			for (const request of requests.splice(0)) {
				request.respond();
			}
			await flush();
		},
		store,
	};
}

/** Let queued microtasks, promise callbacks and the renders they cause run. */
export function flush(): Promise<void> {
	return act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			}),
	);
}

/**
 * Start something that changes what's on screen, render what it changed so
 * far, and hand back its promise without waiting for it to settle.
 */
export async function start<T>(
	run: () => Promise<T>,
): Promise<readonly [done: Promise<T>]> {
	let done!: Promise<T>;
	await act(async () => {
		done = run();
	});
	return [done];
}

/** A browser client on a fake clock. */
export function testClient(config: QueryClientConfig = {}): QueryClient {
	return createQueryClient({ clock: fakeClock(), isServer: false, ...config });
}

function clockOf(client: QueryClient): FakeClock {
	// SAFETY: test clients run on a fake clock.
	return client.clock as FakeClock;
}

/** Move a test client's clock forward, firing its due timers. */
export function advance(client: QueryClient, ms: number): void {
	act(() => {
		clockOf(client).advance(ms);
	});
}

/** How many timers a test client has scheduled. */
export function timersOf(client: QueryClient): number {
	return clockOf(client).timers;
}

function provider(client: QueryClient) {
	return (props: { readonly children?: ReactNode }) =>
		createElement(QueryClientProvider, { client }, props.children);
}

/**
 * Read a query the way a component does, with `useQuery` under a provider:
 * it has a reader, and the client's features run, until `unmount()`.
 * `renders()` counts the renders so far. Its result holds a copy of the
 * state, so every field is read while rendering and a write to any of them
 * re-renders.
 */
export function read<
	TFactory extends SingleQueryFactory,
	const THandle extends QueryHandle<TFactory>,
>(
	client: QueryClient,
	factory: TFactory,
	handle: THandle,
	options?: UseQueryOptions,
) {
	let renders = 0;
	const hook = renderHook(
		() => {
			renders += 1;
			const [thenable, state] = useQuery(factory, handle, options);
			return [thenable, { ...state }] as const;
		},
		{ wrapper: provider(client) },
	);
	return Object.assign(hook, { renders: () => renders });
}

/** `read` for a paged query, with `useInfiniteQuery`. */
export function readPages<
	TFactory extends InfiniteQueryFactory,
	const THandle extends QueryHandle<TFactory>,
>(
	client: QueryClient,
	factory: TFactory,
	handle: THandle,
	options?: UseQueryOptions,
) {
	let renders = 0;
	const hook = renderHook(
		() => {
			renders += 1;
			const [thenable, state] = useInfiniteQuery(factory, handle, options);
			return [thenable, { ...state }] as const;
		},
		{ wrapper: provider(client) },
	);
	return Object.assign(hook, { renders: () => renders });
}

/** Mount a client under a provider with nothing reading, so its features run. */
export function mount(client: QueryClient, ui: ReactNode = null): RenderResult {
	return render(ui, { wrapper: provider(client) });
}

/** A client with issues 1 and 2 and draft 3 cached and fresh forever. */
export async function cached() {
	const backend = createBackend();
	const client = testClient({ staleTime: Infinity });
	const loading = load(client, {
		draft: revalidate(backend.draftQuery, { id: 3 }),
		one: revalidate(backend.issueQuery, { id: 1 }),
		two: revalidate(backend.issueQuery, { id: 2 }),
	});
	await backend.respondAll();
	const [handles] = await loading;
	/** Which of them the next revalidate entries refetch: the stale ones. */
	const refetched = async () => {
		void load(client, {
			draft: revalidate(backend.draftQuery, { id: 3 }),
			one: revalidate(backend.issueQuery, { id: 1 }),
			two: revalidate(backend.issueQuery, { id: 2 }),
		});
		const ids = backend.requests.map((request) =>
			request.id === 3 ? "draft" : request.id === 1 ? "one" : "two",
		);
		await backend.respondAll();
		return ids;
	};
	return { backend, client, handles, refetched };
}

type Meta = {
	readonly refetchInterval?: PollingMeta["refetchInterval"];
	readonly refetchOnReconnect?: ReconnectRefetchMeta["refetchOnReconnect"];
	readonly refetchOnWindowFocus?: FocusRefetchMeta["refetchOnWindowFocus"];
};

/** Queries that count their requests, each with its own `meta`. */
export function counted() {
	const calls = new Map<string, number>();
	const query = (input: { readonly meta?: Meta; readonly name: string }) =>
		queryOptions({
			meta: input.meta,
			queryFn: () => {
				const count = (calls.get(input.name) ?? 0) + 1;
				calls.set(input.name, count);
				return count;
			},
			queryKey: issues("counted", input.name),
		});
	/** Read the named query in a component, under its own provider; it loads at once. */
	const show = async (client: QueryClient, name: string, meta?: Meta) => {
		const reader = read(client, query, waterfallHandle(query, { meta, name }));
		await flush();
		return reader;
	};
	return { calls: (name: string) => calls.get(name) ?? 0, query, show };
}

/** A query that fails with `errors` in turn, then answers with how many attempts it took. */
export function flaky(errors: ReadonlyArray<unknown>) {
	const signals: Array<AbortSignal> = [];
	const query = () =>
		queryOptions({
			queryFn: async (context) => {
				signals.push(context.signal);
				const error = errors[signals.length - 1];
				if (error !== undefined) {
					throw error;
				}
				return signals.length;
			},
			queryKey: issues("flaky"),
		});
	return { attempts: () => signals.length, query, signals };
}

interface Outcome {
	done?: boolean;
	error?: unknown;
	value?: unknown;
}

/** Start loading `entry` and report how it ends, without waiting for it. */
export async function loadOne(client: QueryClient, entry: LoadEntry) {
	const outcome: Outcome = {};
	load(client, { value: entry }).then(
		([handles]) => Object.assign(outcome, { done: true, value: handles }),
		(error: unknown) => Object.assign(outcome, { done: true, error }),
	);
	await flush();
	return outcome;
}

export const down = new Error("down");
