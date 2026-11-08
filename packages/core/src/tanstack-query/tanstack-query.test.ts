/**
 * `tanstackQuerySync()` is a feature: it runs while a provider has the
 * client mounted and stops when that signal aborts. It subscribes to both
 * caches and writes the other side's data, errors, invalidations, resets
 * and removals, matched by `hashKey`. An echo guard remembers the last
 * state it left on each side, and an `applying` flag drops the write it
 * just made. A group stamp matches a TanStack key by prefix; a factory
 * stamp and a `where` target only match entries raf has read, because a
 * mirror has no factory or `meta`. One side refetches: raf, when it has a
 * reader and options, otherwise TanStack when its observer is active. A
 * `skipToken` entry starts nothing, so there is nothing to mirror.
 */
import {
	dehydrate as dehydrateTanStack,
	hydrate as hydrateTanStack,
	QueryClient as TanStackQueryClient,
	QueryObserver,
	type QueryObserverOptions,
} from "@tanstack/query-core";
import { type QueryState, useQuery } from "@raf-query/react";
import { createElement, Suspense, use } from "react";
import { describe, expect, it } from "vitest";

import {
	createQueryClient,
	dehydrate,
	getData,
	group,
	hydrate,
	invalidateMany,
	invalidateOne,
	load,
	prefetch,
	type QueryClient,
	type QueryFactory,
	type QueryHandle,
	type QueryKey,
	queryOptions,
	removeAll,
	removeOne,
	revalidate,
	resetOne,
	setData,
	skipToken,
	swr,
} from "../index.ts";
import {
	tanstackQuerySync,
	type TanStackQuerySyncOptions,
} from "./tanstack-query.ts";
import { flush, mount } from "../test-utils.ts";

interface Post {
	readonly id: number;
	readonly title: string;
}

const posts = group("posts");
const drafts = group(posts, "drafts");
const users = group("users");

/** Requests each side made. */
interface Calls {
	raf: number;
	tanstack: number;
}

/**
 * A backend both caches fetch from, counting requests per side. Post 404
 * is missing; post 500 is down. Each is a thrown error.
 */
function createApi() {
	const titles = new Map([
		[1, "First"],
		[2, "Second"],
	]);
	const calls: Calls = { raf: 0, tanstack: 0 };
	const missing = new Error("Missing");
	const down = new Error("Down");
	const get = async (id: number): Promise<Post> => {
		await Promise.resolve();
		if (id === 404) {
			throw missing;
		}
		if (id === 500) {
			throw down;
		}
		return { id, title: titles.get(id) ?? "?" };
	};
	/** The raf-query factory for the key the TanStack Query screens use. */
	const postQuery = (input: { readonly id: number }) =>
		queryOptions({
			queryFn: () => {
				calls.raf += 1;
				return get(input.id);
			},
			queryKey: posts("byId", input),
			staleTime: 60_000,
		});
	/** The same query on a TanStack Query screen. */
	const tanstackPost = (id: number) => ({
		queryFn: () => {
			calls.tanstack += 1;
			return get(id);
		},
		queryKey: posts("byId", { id }),
		retry: false,
		staleTime: 60_000,
	});
	return { calls, down, missing, postQuery, tanstackPost, titles };
}

/** A raf-query client and a TanStack Query client, synced once the raf client mounts. */
function createClients(options?: TanStackQuerySyncOptions) {
	const tanstack = new TanStackQueryClient();
	const client = createQueryClient({
		features: [tanstackQuerySync(tanstack, options)],
		isServer: false,
	});
	return {
		client,
		[Symbol.dispose]() {
			removeAll(client);
			tanstack.clear();
		},
		tanstack,
	};
}

/** A TanStack Query screen: an observer of one query, until disposed. */
function observe(tanstack: TanStackQueryClient, options: QueryObserverOptions) {
	const observer = new QueryObserver(tanstack, options);
	return { observer, [Symbol.dispose]: observer.subscribe(() => {}) };
}

function Reader(props: {
	readonly factory: QueryFactory;
	readonly handle: QueryHandle<QueryFactory>;
	readonly show: (query: unknown, queryState: QueryState) => void;
}) {
	const [queryThenable, queryState] = useQuery(props.factory, props.handle);
	const query = use(queryThenable);
	props.show(query, { ...queryState });
	return null;
}

type Read = readonly [factory: QueryFactory, handle: QueryHandle<QueryFactory>];

/**
 * Mount the raf client with a component reading each handle under one
 * Suspense boundary. `shown[i]` is the data the i-th screen rendered last
 * and `states[i]` its state, copied in render so every field is tracked;
 * `show()` swaps the screens.
 */
function screens(client: QueryClient, reads: ReadonlyArray<Read> = []) {
	const shown: Array<unknown> = [];
	const states: Array<QueryState> = [];
	const ui = (list: ReadonlyArray<Read>) =>
		createElement(
			Suspense,
			{ fallback: null },
			list.map(([factory, handle], index) =>
				createElement(Reader, {
					factory,
					handle,
					key: index,
					show: (query, queryState) => {
						shown[index] = query;
						states[index] = queryState;
					},
				}),
			),
		);
	const view = mount(client, ui(reads));
	return {
		show: (list: ReadonlyArray<Read>) => view.rerender(ui(list)),
		shown,
		states,
	};
}

describe("a screen on each side", () => {
	it("shows a TanStack Query screen the data raf-query loaded, fresh, and keeps edits in step", async () => {
		const api = createApi();
		using clients = createClients();
		mount(clients.client);
		await load(clients.client, { post: swr(api.postQuery, { id: 1 }) });
		using screen = observe(clients.tanstack, api.tanstackPost(1));

		expect(screen.observer.getCurrentResult()).toMatchObject({
			data: { id: 1, title: "First" },
			isStale: false,
			status: "success",
		});
		setData(
			clients.client,
			api.postQuery,
			{ id: 1 },
			{ id: 1, title: "Edited" },
		);
		await flush();
		expect(screen.observer.getCurrentResult().data).toEqual({
			id: 1,
			title: "Edited",
		});
		expect(api.calls).toEqual({ raf: 1, tanstack: 0 });
	});

	it("shows a raf-query screen the data TanStack Query fetched, fresh, and keeps edits in step", async () => {
		const api = createApi();
		using clients = createClients();
		mount(clients.client);
		await clients.tanstack.query(api.tanstackPost(1));
		const [, data] = await load(clients.client, {
			post: revalidate(api.postQuery, { id: 1 }),
		});

		expect(data.post).toEqual({ id: 1, title: "First" });
		clients.tanstack.setQueryData(posts("byId", { id: 1 }), {
			id: 1,
			title: "Edited",
		});
		expect(getData(clients.client, api.postQuery, { id: 1 })).toEqual({
			id: 1,
			title: "Edited",
		});
		expect(api.calls).toEqual({ raf: 0, tanstack: 1 });
	});

	it("writes each change to the other cache once, without echoing it back", async () => {
		const api = createApi();
		using clients = createClients();
		mount(clients.client);
		const writes: Array<string> = [];
		clients.tanstack.getQueryCache().subscribe((event) => {
			if (event.type === "updated" && event.action.type === "success") {
				writes.push("tanstack");
			}
		});
		clients.client.subscribe((event) => {
			if (event.type === "updated") {
				writes.push("raf");
			}
		});
		setData(clients.client, api.postQuery, { id: 1 }, { id: 1, title: "A" });
		await flush();
		clients.tanstack.setQueryData(posts("byId", { id: 1 }), {
			id: 1,
			title: "B",
		});
		await flush();

		expect(writes).toEqual(["tanstack", "raf", "tanstack", "raf"]);
	});
});

describe("errors", () => {
	it("shows a TanStack Query screen the error raf-query threw", async () => {
		const api = createApi();
		using clients = createClients();
		mount(clients.client);
		using missing = observe(clients.tanstack, {
			...api.tanstackPost(404),
			enabled: false,
		});
		using down = observe(clients.tanstack, {
			...api.tanstackPost(500),
			enabled: false,
		});
		await load(clients.client, {
			down: prefetch(api.postQuery, { id: 500 }),
			missing: prefetch(api.postQuery, { id: 404 }),
		});
		await flush();

		expect(missing.observer.getCurrentResult()).toMatchObject({
			error: api.missing,
			status: "error",
		});
		expect(down.observer.getCurrentResult().error).toBe(api.down);
	});

	it("shows a raf-query screen the error TanStack Query threw", async () => {
		const api = createApi();
		using clients = createClients();
		const [handles] = await load(clients.client, {
			down: swr(api.postQuery, { id: 1 }),
			missing: swr(api.postQuery, { id: 2 }),
		});
		const view = screens(clients.client, [
			[api.postQuery, handles.down],
			[api.postQuery, handles.missing],
		]);
		const missing = new Error("Missing");
		await clients.tanstack
			.query({
				...api.tanstackPost(500),
				queryKey: posts("byId", { id: 1 }),
				staleTime: 0,
			})
			.catch(() => {});
		await clients.tanstack
			.query({
				queryFn: () => Promise.reject(missing),
				queryKey: posts("byId", { id: 2 }),
				retry: false,
				staleTime: 0,
			})
			.catch(() => {});
		await flush();

		expect(view.states[0]?.error).toBe(api.down);
		expect(view.states[1]?.error).toBe(missing);
	});
});

describe("invalidation", () => {
	it("refetches on the TanStack Query screen when raf-query doesn't read the query", async () => {
		const api = createApi();
		using clients = createClients();
		mount(clients.client);
		await load(clients.client, { post: swr(api.postQuery, { id: 1 }) });
		using screen = observe(clients.tanstack, api.tanstackPost(1));
		api.titles.set(1, "Renamed");
		await invalidateOne(clients.client, api.postQuery, { id: 1 });
		await flush();

		expect(screen.observer.getCurrentResult().data).toEqual({
			id: 1,
			title: "Renamed",
		});
		expect(getData(clients.client, api.postQuery, { id: 1 })).toEqual({
			id: 1,
			title: "Renamed",
		});
		expect(api.calls).toEqual({ raf: 1, tanstack: 1 });
	});

	it("refetches once, on raf-query, when both sides read the query", async () => {
		const api = createApi();
		using clients = createClients();
		const [handles] = await load(clients.client, {
			post: swr(api.postQuery, { id: 1 }),
		});
		screens(clients.client, [[api.postQuery, handles.post]]);
		using screen = observe(clients.tanstack, api.tanstackPost(1));
		api.titles.set(1, "Renamed");
		await invalidateOne(clients.client, api.postQuery, { id: 1 });
		await flush();

		expect(screen.observer.getCurrentResult()).toMatchObject({
			data: { id: 1, title: "Renamed" },
			isStale: false,
		});
		expect(api.calls).toEqual({ raf: 2, tanstack: 0 });
	});

	it("refetches once, on the TanStack Query screen, when TanStack Query invalidates a query both sides read", async () => {
		const api = createApi();
		using clients = createClients();
		const [handles] = await load(clients.client, {
			post: swr(api.postQuery, { id: 1 }),
		});
		screens(clients.client, [[api.postQuery, handles.post]]);
		using _screen = observe(clients.tanstack, api.tanstackPost(1));
		api.titles.set(1, "Renamed");
		await clients.tanstack.invalidateQueries({
			queryKey: posts("byId", { id: 1 }),
		});
		await flush();
		const [, data] = await load(clients.client, {
			post: revalidate(api.postQuery, { id: 1 }),
		});

		expect(data.post).toEqual({ id: 1, title: "Renamed" });
		expect(api.calls).toEqual({ raf: 1, tanstack: 1 });
	});

	it("reaches every raf-query query under a key prefix TanStack Query invalidates", async () => {
		using clients = createClients();
		const fetches = new Map<string, number>();
		interface ById {
			readonly id: number;
			readonly lang?: string;
		}
		const byId = (key: (input: ById) => QueryKey) => (input: ById) =>
			queryOptions({
				queryFn: () => {
					const name = JSON.stringify(key(input));
					fetches.set(name, (fetches.get(name) ?? 0) + 1);
					return fetches.get(name);
				},
				queryKey: key(input),
				staleTime: 60_000,
			});
		const postById = byId((input) => posts("byId", input));
		const draftById = byId((input) => drafts("byId", input));
		const userById = byId((input) => users("byId", input));
		const [handles] = await load(clients.client, {
			draft: swr(draftById, { id: 1 }),
			post: swr(postById, { id: 1, lang: "en" }),
			unread: swr(postById, { id: 2 }),
			user: swr(userById, { id: 1 }),
		});
		const view = screens(clients.client, [
			[postById, handles.post],
			[draftById, handles.draft],
			[userById, handles.user],
		]);
		const shown = () => [...view.shown];

		expect(shown()).toEqual([1, 1, 1]);
		await clients.tanstack.invalidateQueries({ queryKey: posts() });
		await flush();
		expect(shown()).toEqual([2, 2, 1]);
		expect(
			clients.tanstack.getQueryData(posts("byId", { id: 1, lang: "en" })),
		).toBe(2);
		await load(clients.client, { unread: prefetch(postById, { id: 2 }) });
		expect(getData(clients.client, postById, { id: 2 })).toBe(2);

		await clients.tanstack.invalidateQueries({
			queryKey: posts("byId", { id: 1 }),
		});
		await flush();
		expect(shown()).toEqual([3, 2, 1]);
	});

	it("reaches queries only TanStack Query has when raf-query invalidates a group", async () => {
		using clients = createClients();
		mount(clients.client);
		clients.tanstack.setQueryData(drafts("byId", { id: 2 }), "draft");
		clients.tanstack.setQueryData(users("byId", { id: 1 }), "user");
		await invalidateMany(clients.client, posts);

		expect(
			clients.tanstack.getQueryState(drafts("byId", { id: 2 }))?.isInvalidated,
		).toBe(true);
		expect(
			clients.tanstack.getQueryState(users("byId", { id: 1 }))?.isInvalidated,
		).toBe(false);
	});
});

describe("resets and removals", () => {
	it("resets the other copy", async () => {
		const api = createApi();
		using clients = createClients();
		mount(clients.client);
		await load(clients.client, { post: swr(api.postQuery, { id: 1 }) });
		await resetOne(clients.client, api.postQuery, { id: 1 });
		await flush();

		expect(
			clients.tanstack.getQueryData(posts("byId", { id: 1 })),
		).toBeUndefined();

		await load(clients.client, { post: swr(api.postQuery, { id: 1 }) });
		await clients.tanstack.resetQueries({ queryKey: posts() });
		expect(getData(clients.client, api.postQuery, { id: 1 })).toBeUndefined();
	});

	it("removes the other copy unless a screen reads it", async () => {
		const api = createApi();
		using clients = createClients();
		const view = screens(clients.client);
		await load(clients.client, {
			one: swr(api.postQuery, { id: 1 }),
			two: swr(api.postQuery, { id: 2 }),
		});
		using _screen = observe(clients.tanstack, {
			...api.tanstackPost(2),
			enabled: false,
		});
		removeOne(clients.client, api.postQuery, { id: 1 });
		removeOne(clients.client, api.postQuery, { id: 2 });

		expect(
			clients.tanstack.getQueryState(posts("byId", { id: 1 })),
		).toBeUndefined();
		expect(clients.tanstack.getQueryData(posts("byId", { id: 2 }))).toEqual({
			id: 2,
			title: "Second",
		});

		await clients.tanstack.query(api.tanstackPost(3));
		await clients.tanstack.query(api.tanstackPost(4));
		const [handles] = await load(clients.client, {
			four: swr(api.postQuery, { id: 4 }),
		});
		view.show([[api.postQuery, handles.four]]);
		clients.tanstack.removeQueries({ queryKey: posts() });

		expect(getData(clients.client, api.postQuery, { id: 3 })).toBeUndefined();
		expect(view.shown[0]).toMatchObject({ id: 4 });
		expect(getData(clients.client, api.postQuery, { id: 4 })).toEqual({
			id: 4,
			title: "?",
		});
		expect(api.calls).toEqual({ raf: 2, tanstack: 2 });
	});

	it("keeps the original when the copy the sync made is removed", async () => {
		const api = createApi();
		using clients = createClients();
		mount(clients.client);
		await load(clients.client, { post: swr(api.postQuery, { id: 1 }) });
		clients.tanstack.removeQueries({ queryKey: posts("byId", { id: 1 }) });

		expect(getData(clients.client, api.postQuery, { id: 1 })).toEqual({
			id: 1,
			title: "First",
		});

		await clients.tanstack.query(api.tanstackPost(2));
		removeOne(clients.client, api.postQuery, { id: 2 });
		expect(clients.tanstack.getQueryData(posts("byId", { id: 2 }))).toEqual({
			id: 2,
			title: "Second",
		});
	});
});

describe("hydration", () => {
	it("mirrors what raf-query hydrates, including a query the server is still loading", async () => {
		const api = createApi();
		const server = createQueryClient({ isServer: true });
		await load(server, {
			done: swr(api.postQuery, { id: 1 }),
			pending: prefetch(api.postQuery, { id: 2 }),
		});
		const state = dehydrate(server);
		using clients = createClients();
		mount(clients.client);
		hydrate(clients.client, state);
		await flush();

		expect(clients.tanstack.getQueryData(posts("byId", { id: 1 }))).toEqual({
			id: 1,
			title: "First",
		});
		expect(clients.tanstack.getQueryData(posts("byId", { id: 2 }))).toEqual({
			id: 2,
			title: "Second",
		});
		expect(api.calls).toEqual({ raf: 2, tanstack: 0 });
	});

	it("mirrors what TanStack Query hydrates", async () => {
		const api = createApi();
		const server = new TanStackQueryClient();
		await server.query(api.tanstackPost(1));
		const state = structuredClone(dehydrateTanStack(server));
		using clients = createClients();
		mount(clients.client);
		hydrateTanStack(clients.tanstack, state);
		const [, data] = await load(clients.client, {
			post: revalidate(api.postQuery, { id: 1 }),
		});

		expect(data.post).toEqual({ id: 1, title: "First" });
		expect(api.calls).toEqual({ raf: 0, tanstack: 1 });
	});

	it("merges both caches when it starts, newer data winning and invalidations carried over", async () => {
		const api = createApi();
		using clients = createClients();
		const { client, tanstack } = clients;
		tanstack.setQueryData(
			posts("byId", { id: 1 }),
			{ id: 1, title: "Older" },
			{ updatedAt: 1 },
		);
		tanstack.setQueryData(posts("byId", { id: 2 }), { id: 2, title: "Newer" });
		setData(client, api.postQuery, { id: 1 }, { id: 1, title: "Newer" });
		setData(client, api.postQuery, { id: 3 }, { id: 3, title: "Only raf" });
		await invalidateOne(client, api.postQuery, { id: 3 });
		mount(client);

		expect(tanstack.getQueryData(posts("byId", { id: 1 }))).toEqual({
			id: 1,
			title: "Newer",
		});
		expect(getData(client, api.postQuery, { id: 2 })).toEqual({
			id: 2,
			title: "Newer",
		});
		expect(
			tanstack.getQueryState(posts("byId", { id: 3 }))?.isInvalidated,
		).toBe(true);
	});

	it("mirrors nothing for a load entry skipped with skipToken", async () => {
		const api = createApi();
		using clients = createClients();
		mount(clients.client);
		const [handles, data] = await load(clients.client, {
			draft: skipToken,
			post: swr(api.postQuery, { id: 1 }),
		});
		await flush();

		expect(handles.draft).toBeUndefined();
		expect(data).not.toHaveProperty("draft");
		expect(data.post).toEqual({ id: 1, title: "First" });
		expect(clients.tanstack.getQueryCache().getAll()).toHaveLength(1);
		expect(clients.tanstack.getQueryData(posts("byId", { id: 1 }))).toEqual({
			id: 1,
			title: "First",
		});
	});
});

describe("options", () => {
	it("mirrors only the keys `filter` takes, from before and after it starts", async () => {
		const api = createApi();
		const local = group("local");
		const remote = group("remote");
		const localQuery = () =>
			queryOptions({ queryFn: () => 1, queryKey: local() });
		const remoteQuery = () =>
			queryOptions({ queryFn: () => 2, queryKey: remote() });
		using clients = createClients({ filter: (key) => key[0] === "posts" });
		clients.tanstack.setQueryData(remote(), 2);
		setData(clients.client, localQuery, 1);
		mount(clients.client);
		setData(clients.client, api.postQuery, { id: 1 }, { id: 1, title: "A" });
		setData(clients.client, localQuery, 3);
		clients.tanstack.setQueryData(remote(), 4);
		removeOne(clients.client, localQuery);
		clients.tanstack.removeQueries({ queryKey: remote() });
		await flush();

		expect(clients.tanstack.getQueryData(posts("byId", { id: 1 }))).toEqual({
			id: 1,
			title: "A",
		});
		expect(clients.tanstack.getQueryData(local())).toBeUndefined();
		expect(getData(clients.client, remoteQuery)).toBeUndefined();
	});

	it("stops when the client unmounts", async () => {
		const api = createApi();
		using clients = createClients();
		mount(clients.client).unmount();
		setData(clients.client, api.postQuery, { id: 1 }, { id: 1, title: "A" });
		clients.tanstack.setQueryData(posts("byId", { id: 2 }), {
			id: 2,
			title: "B",
		});
		await flush();

		expect(
			clients.tanstack.getQueryData(posts("byId", { id: 1 })),
		).toBeUndefined();
		expect(getData(clients.client, api.postQuery, { id: 2 })).toBeUndefined();
	});
});
