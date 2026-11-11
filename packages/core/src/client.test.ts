/**
 * `createQueryClient()` with no config: the system clock, a 5-minute
 * `gcTime`, and cache events through `client.subscribe`. Its plugins give
 * every `queryFn` their context, wrap every request in array order, and
 * read the client's `defaults` under each query's own options.
 */
import { describe, expect, it, vi } from "vitest";

import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	createQueryClient,
	getData,
	load,
	plugin,
	prefetch,
	type QueryClient,
	retry,
	swr,
} from "./index.ts";
import {
	down,
	flush,
	infiniteQueryOptions,
	issues,
	loadOne,
	queryOptions,
	testClient,
} from "./test-utils.ts";

const count = (input: { readonly name: string }) =>
	queryOptions({ queryFn: async () => 1, queryKey: issues("count", input) });

describe("a client with the defaults", () => {
	it("runs on the real clock and drops unread data after five minutes", async () => {
		vi.useFakeTimers();
		const client = createQueryClient();
		await load(client, { count: prefetch(count, { name: "a" }) });
		await vi.advanceTimersByTimeAsync(0);

		expect(client.isServer).toBe(false);
		expect(getData(client, count, { name: "a" })).toBe(1);
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1);
		expect(getData(client, count, { name: "a" })).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(getData(client, count, { name: "a" })).toBeUndefined();
		vi.useRealTimers();
	});
});

describe("a client's plugins", () => {
	interface Session {
		readonly context: { readonly user: string };
	}
	const session = (user: string) => plugin<Session>({ context: { user } });

	it("give every queryFn their context, plain or paged, one per client", async () => {
		const sessionQueryOptions = bindQueryOptions<Session>();
		const sessionInfiniteQueryOptions = bindInfiniteQueryOptions<Session>();
		const whoAmI = () =>
			sessionQueryOptions({
				queryFn: (context) => context.user,
				queryKey: issues("whoAmI"),
			});
		const pages = () =>
			sessionInfiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				queryFn: (context) => `${context.user}'s page ${context.pageParam}`,
				queryKey: issues("pages"),
			});
		// One session per query client, as a server keeps one per request.
		const ada = createQueryClient({
			isServer: true,
			plugins: [session("ada")],
		});
		const bob = createQueryClient({
			isServer: true,
			plugins: [session("bob")],
		});
		const [, adas] = await load(ada, { me: swr(whoAmI), pages: swr(pages) });
		const [, bobs] = await load(bob, { me: swr(whoAmI), pages: swr(pages) });

		expect([adas.me, adas.pages.pages]).toEqual(["ada", ["ada's page 0"]]);
		expect([bobs.me, bobs.pages.pages]).toEqual(["bob", ["bob's page 0"]]);
	});

	it("give each request the context a link adds, for plain and paged queries and for the links after it", async () => {
		interface Traced {
			readonly context: { readonly traceId: string };
		}
		let requests = 0;
		const traced = plugin<Traced>({
			link: (op, next) =>
				next({
					...op,
					context: { ...op.context, traceId: `trace-${(requests += 1)}` },
				}),
		});
		const seen: Array<unknown> = [];
		const inner = plugin({
			link: (op, next) => {
				seen.push(op.context);
				return next(op);
			},
		});
		const makeClient = () =>
			createQueryClient({
				isServer: true,
				plugins: [session("ada"), traced, inner],
			});
		const tracedQueryOptions = bindQueryOptions<typeof makeClient>();
		const tracedInfiniteQueryOptions =
			bindInfiniteQueryOptions<typeof makeClient>();
		const who = (input: { readonly name: string }) =>
			tracedQueryOptions({
				queryFn: (context) => `${context.user} ${context.traceId}`,
				queryKey: issues("traced", input),
			});
		const pages = () =>
			tracedInfiniteQueryOptions({
				getNextPageParam: (_page, all) => (all.length < 2 ? all.length : null),
				initialPageParam: 0,
				queryFn: (context) => `${context.traceId} page ${context.pageParam}`,
				queryKey: issues("traced-pages"),
			});
		const client = makeClient();
		const [, first] = await load(client, { who: swr(who, { name: "a" }) });
		const [, second] = await load(client, {
			pages: swr(pages, undefined, { pages: 2 }),
			who: swr(who, { name: "b" }),
		});

		expect(first.who).toBe("ada trace-1");
		expect(second.who).toBe("ada trace-3");
		// One request, so one trace, for both of its pages.
		expect(second.pages.pages).toEqual(["trace-2 page 0", "trace-2 page 1"]);
		expect(seen[0]).toEqual({ traceId: "trace-1", user: "ada" });
	});

	it("let a link replace, for one request, what a plugin gives the client", async () => {
		const impersonating = plugin<{
			readonly options: { readonly as?: string };
		}>({
			link: (op, next) =>
				op.options.as === undefined
					? next(op)
					: next({ ...op, context: { ...op.context, user: op.options.as } }),
		});
		const makeClient = () =>
			createQueryClient({
				isServer: true,
				plugins: [session("ada"), impersonating],
			});
		const sessionQueryOptions = bindQueryOptions<typeof makeClient>();
		const whoAmI = (input: { readonly as?: string }) =>
			sessionQueryOptions({
				...input,
				queryFn: (context) => context.user,
				queryKey: issues("whoAmI", input),
			});
		const [, data] = await load(makeClient(), {
			bob: swr(whoAmI, { as: "bob" }),
			own: swr(whoAmI, {}),
		});

		expect(data).toEqual({ bob: "bob", own: "ada" });
	});

	it("wrap every request outermost first, skipping the plugins without a link", async () => {
		const order: Array<string> = [];
		const named = (name: string) =>
			plugin({
				link: async (op, next) => {
					order.push(`${name} in`);
					const result = await next(op);
					order.push(`${name} out`);
					return result;
				},
			});
		const client = createQueryClient({
			plugins: [
				named("outer"),
				plugin(),
				plugin({ setup: () => {} }),
				named("inner"),
			],
		});
		await load(client, { count: swr(count, { name: "ordered" }) });

		expect(order).toEqual(["outer in", "inner in", "inner out", "outer out"]);
	});

	it("read the client's defaults for an option a query doesn't set", async () => {
		interface Labelled {
			readonly options: { readonly label?: string };
		}
		const labels: Array<string | undefined> = [];
		const labelled = plugin<Labelled>({
			link: (op, next) => {
				labels.push(op.options.label);
				return next(op);
			},
		});
		const makeClient = () =>
			createQueryClient({
				defaults: { label: "default" },
				plugins: [labelled],
			});
		const labelledQueryOptions = bindQueryOptions<typeof makeClient>();
		const query = (input: { readonly label?: string }) =>
			labelledQueryOptions({
				...input,
				queryFn: () => 1,
				queryKey: issues("labelled", input),
			});
		const client = makeClient();
		await load(client, {
			own: swr(query, { label: "own" }),
			unset: swr(query, {}),
		});

		expect(labels).toEqual(["own", "default"]);
	});

	it("take a built-in plugin's option as a default too", async () => {
		let attempts = 0;
		const failing = () =>
			queryOptions({
				queryFn: async () => {
					attempts += 1;
					throw down;
				},
				queryKey: issues("failing-by-default"),
			});
		const client = testClient({
			defaults: { retry: false },
			plugins: [retry({ delay: () => 0 })],
		});
		const outcome = await loadOne(client, swr(failing));
		await flush();

		expect(outcome.error).toBe(down);
		expect(attempts).toBe(1);
	});
});

describe("the client making a request", () => {
	it("is in the queryFn's context, plain or paged", async () => {
		const seen: Array<QueryClient> = [];
		const plain = () =>
			queryOptions({
				queryFn: (context) => seen.push(context.client),
				queryKey: issues("client"),
			});
		const pages = () =>
			infiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				queryFn: (context) => seen.push(context.client),
				queryKey: issues("client-pages"),
			});
		const client = createQueryClient({ isServer: true });
		await load(client, { pages: swr(pages), plain: swr(plain) });

		expect(seen).toEqual([client, client]);
	});
});

describe("cache events", () => {
	it("reach a subscriber until it unsubscribes, and never one that subscribed aborted", async () => {
		const client = createQueryClient();
		const seen: Array<string> = [];
		const controller = new AbortController();
		const unsubscribe = client.subscribe((event) => seen.push(event.type), {
			signal: controller.signal,
		});
		client.subscribe(() => seen.push("aborted"), {
			signal: AbortSignal.abort(),
		})();
		await load(client, { a: prefetch(count, { name: "a" }) });
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		unsubscribe();
		const before = [...seen];
		await load(client, { b: prefetch(count, { name: "b" }) });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(before).toEqual(["added", "updated", "updated"]);
		expect(seen).toEqual(before);
	});

	it("start with every cached entry for a subscriber that asks to replay them", async () => {
		const client = createQueryClient();
		await load(client, {
			a: prefetch(count, { name: "a" }),
			b: prefetch(count, { name: "b" }),
		});
		const replayed: Array<string> = [];
		client.subscribe(
			(event) =>
				replayed.push(`${event.type} ${JSON.stringify(event.entry.key[2])}`),
			{ replay: true },
		);
		client.subscribe(() => replayed.push("aborted"), {
			replay: true,
			signal: AbortSignal.abort(),
		});
		await load(client, { c: prefetch(count, { name: "c" }) });

		expect(replayed.slice(0, 3)).toEqual([
			'added {"name":"a"}',
			'added {"name":"b"}',
			'added {"name":"c"}',
		]);
		expect(replayed).not.toContain("aborted");
	});
});
