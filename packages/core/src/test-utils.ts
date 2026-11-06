import {
	type Clock,
	createQueryClient,
	type QueryClient,
	type QueryClientConfig,
} from "./client.ts";
import { fail } from "./fail.ts";
import { group, tag } from "./groups.ts";
import { infiniteQueryOptions } from "./infinite.ts";
import { queryOptions } from "./options.ts";

export interface Issue {
	readonly author: string;
	readonly id: number;
	readonly title: string;
}

interface Timer {
	readonly at: number;
	readonly callback: () => void;
}

export interface FakeClock extends Clock {
	/** Move time forward, firing due timers in order. */
	advance(ms: number): void;
	readonly timers: number;
}

/** A clock whose timers fire only when the test advances it. */
function fakeClock(start = 1_000_000): FakeClock {
	let now = start;
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
			const timer = { at: now + ms, callback };
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
export const author = tag<string>("author");
export const featured = tag("featured");

interface Request {
	fail(error: unknown): void;
	readonly id: number;
	respond(): void;
	readonly signal: AbortSignal;
}

/**
 * An in-memory backend whose requests settle only when the test says so, so
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
			meta: { tags: (issue: Issue) => [author(issue.author)] },
			queryFn: async (context) => {
				const issue = await get(input.id, context.signal);
				return issue ?? fail({ _tag: "NotFound", id: input.id });
			},
			queryKey: issues("byId", input),
		});

	const draftQuery = (input: { readonly id: number }) =>
		queryOptions({
			meta: { tags: [featured()] },
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
			getPreviousPageParam: () => undefined,
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
		/** Settle every open request. */
		respondAll() {
			for (const request of requests.splice(0)) {
				request.respond();
			}
		},
		store,
	};
}

/** Let queued microtasks and promise callbacks run. */
export function flush() {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

/** A browser-side client on a fake clock. */
export function testClient(config: QueryClientConfig = {}): QueryClient {
	return createQueryClient({ clock: fakeClock(), isServer: false, ...config });
}

function clockOf(client: QueryClient): FakeClock {
	// SAFETY: test clients run on a fake clock.
	return client.clock as FakeClock;
}

/** Move a test client's clock forward. */
export function advance(client: QueryClient, ms: number) {
	clockOf(client).advance(ms);
}

/** How many timers a test client has pending. */
export function timersOf(client: QueryClient): number {
	return clockOf(client).timers;
}
