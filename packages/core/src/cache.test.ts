import { describe, expect, expectTypeOf, it, vi } from "@effect/vitest";
import {
	Cause,
	Context,
	Data,
	Deferred,
	Effect,
	Exit,
	Fiber,
	Layer,
	Option,
	Predicate,
	Scope,
	Stream,
} from "effect";
import { TestClock } from "effect/testing";

import {
	type DehydratedState,
	dehydrateQuery,
	infiniteQueryOptions,
	Platform,
	Query,
	QueryCache,
	type QueryMeta,
	queryOptions,
	RedactedError,
} from "./index.ts";
import { createBackend, fakePlatform, flush } from "./test-utils.ts";

const settle = Effect.promise(flush);

/**
 * Fork `consume(stream)` and wait for the stream's first element, so the
 * subscription it reads from is in place.
 */
const forkStarted = Effect.fnUntraced(function* <A, B>(
	stream: Stream.Stream<A>,
	consume: (started: Stream.Stream<A>) => Effect.Effect<B>,
) {
	const ready = yield* Deferred.make<void>();
	const fiber = yield* Effect.forkChild(
		consume(stream.pipe(Stream.tap(() => Deferred.succeed(ready, undefined)))),
	);
	yield* Deferred.await(ready);
	return fiber;
});

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: number }> {}

function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () =>
			input.id > 0
				? Effect.succeed({ id: input.id })
				: Effect.fail(new NotFound({ id: input.id })),
		queryKey: ["typed-issue", input.id],
		retry: false,
	});
}

class Greeting extends Context.Service<Greeting, string>()("test/Greeting") {}

function greetingQuery(input: { name: string }) {
	return queryOptions({
		queryFn: () =>
			Effect.gen(function* () {
				const greeting = yield* Greeting;
				if (input.name === "") {
					return yield* Effect.fail(new NotFound({ id: 0 }));
				}
				const span = yield* Effect.orDie(Effect.currentSpan);
				return { span: span.name, text: `${greeting}, ${input.name}` };
			}),
		queryKey: ["greeting", input.name],
		retry: false,
	});
}

describe("QueryCache services", () => {
	it.effect("a queryFn reads services the cache was built with", () =>
		Effect.gen(function* () {
			const services = yield* Layer.build(
				QueryCache.layer({ isServer: false }).pipe(
					Layer.provide(Layer.succeed(Greeting, "Hello")),
				),
			);
			const cache = Context.get(services, QueryCache.QueryCache);
			const query = cache.getQueryUnsafe(greetingQuery, { name: "Ada" });

			const greeting = yield* Effect.promise(() => Query.readUnsafe(query));

			expect(greeting).toEqual({
				span: "raf-query.request",
				text: "Hello, Ada",
			});
		}),
	);

	it.effect("a verb's caller provides services, over the cache's", () =>
		Effect.gen(function* () {
			const cache = yield* QueryCache.make({ isServer: false });

			const handle = yield* cache
				.ensure(greetingQuery, { name: "Ada" })
				.pipe(Effect.provide(Layer.succeed(Greeting, "Hi")));
			const layered = yield* Effect.gen(function* () {
				const inner = yield* QueryCache.QueryCache;
				return yield* inner
					.fetch(greetingQuery, { name: "Bob" })
					.pipe(Effect.provideService(Greeting, "Hey"));
			}).pipe(
				Effect.provide(
					QueryCache.layer({ isServer: false }).pipe(
						Layer.provideMerge(Layer.succeed(Greeting, "Hello")),
					),
				),
			);

			expect(handle.ensured).toBe(true);
			const data = yield* cache.getData(greetingQuery, { name: "Ada" });
			expect(Option.map(data, (greeting) => greeting.text)).toEqual(
				Option.some("Hi, Ada"),
			);
			expect(layered.text).toBe("Hey, Bob");
		}),
	);

	it.effect("a queryFn's typed failure stays typed", () =>
		Effect.gen(function* () {
			const cache = yield* QueryCache.make({ isServer: false });

			const error = yield* Effect.flip(
				cache
					.fetch(greetingQuery, { name: "" })
					.pipe(Effect.provideService(Greeting, "Hi")),
			);

			expect(error).toBeInstanceOf(NotFound);
		}),
	);

	it.effect("requests a render starts reuse the latest caller's services", () =>
		Effect.gen(function* () {
			const cache = yield* QueryCache.make({ isServer: false });
			const query = yield* cache
				.getQuery(greetingQuery, { name: "Ada" })
				.pipe(Effect.provideService(Greeting, "Hi"));
			const first = yield* Effect.promise(() => Query.readUnsafe(query));
			yield* cache
				.prefetch(greetingQuery, { name: "Ada" })
				.pipe(Effect.provideService(Greeting, "Hey"));
			Query.subscribeUnsafe(query, () => {});

			yield* cache.invalidate(greetingQuery, { name: "Ada" });

			expect(first.text).toBe("Hi, Ada");
			expect(Query.getUnsafe(query).data?.text).toBe("Hey, Ada");
		}),
	);
});

describe("QueryCache meta", () => {
	function metaQuery(input: { id: number; label: string }) {
		return queryOptions({
			meta: { label: input.label },
			queryFn: (context) => context.meta,
			queryKey: ["meta", input.id],
		});
	}

	it.effect("reaches the queryFn context", () =>
		Effect.gen(function* () {
			const cache = yield* QueryCache.make({ isServer: false });

			const meta = yield* cache.fetch(metaQuery, { id: 1, label: "one" });

			expect(meta).toEqual({ label: "one" });
		}),
	);

	it.effect("reaches the page function context", () =>
		Effect.gen(function* () {
			const cache = yield* QueryCache.make({ isServer: false });
			function pagedQuery() {
				return infiniteQueryOptions({
					getNextPageParam: (_last: QueryMeta | undefined, pages) =>
						pages.length < 2 ? pages.length : undefined,
					initialPageParam: 0,
					meta: { label: "paged" },
					queryFn: (context) => context.meta,
					queryKey: ["meta", "paged"],
				});
			}

			const data = yield* cache.fetch(pagedQuery, undefined, { pages: 2 });

			expect(data.pages).toEqual([{ label: "paged" }, { label: "paged" }]);
		}),
	);

	it.effect(
		"Query.metaUnsafe follows the latest factory call, and is undefined for hydrated entries",
		() =>
			Effect.gen(function* () {
				const cache = yield* QueryCache.make({ isServer: false });
				yield* cache.hydrate({
					queries: [
						{ data: { label: "server" }, key: ["meta", 1], updatedAt: 1 },
					],
				});
				const [hydrated] = yield* cache.all;
				expect(hydrated && Query.metaUnsafe(hydrated)).toBeUndefined();

				const query = yield* cache.getQuery(metaQuery, { id: 1, label: "a" });
				expect(Query.metaUnsafe(query)).toEqual({ label: "a" });
				yield* cache.prefetch(metaQuery, { id: 1, label: "b" });
				expect(Query.metaUnsafe(query)).toEqual({ label: "b" });
			}),
	);
});

describe("QueryCache", () => {
	it.effect("ensure and fetch succeed with the handle and the data", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const cache = yield* QueryCache.make({ isServer: false });
			const fiber = yield* Effect.forkChild(
				Effect.all([
					cache.ensure(backend.issueQuery, { id: 1 }),
					cache.fetch(backend.issueQuery, { id: 1 }),
				]),
			);
			yield* settle;
			backend.respondAll();

			const [handle, issue] = yield* Fiber.join(fiber);

			expect(handle.key).toEqual(["issue", 1]);
			expect(issue.title).toBe("First");
		}),
	);

	it.effect("fetch fails with the queryFn's typed error", () =>
		Effect.gen(function* () {
			const cache = yield* QueryCache.make({ isServer: false });

			const error = yield* Effect.flip(cache.fetch(issueQuery, { id: 0 }));

			expect(error).toBeInstanceOf(NotFound);
			const query = yield* cache.getQuery(issueQuery, { id: 0 });
			const state = yield* Query.get(query);
			expect(state.error).toBe(error);
		}),
	);

	it.effect("treats a synchronous throw as a defect, without retrying", () =>
		Effect.gen(function* () {
			const queryFn = vi.fn((): number => {
				throw new Error("bug");
			});
			const cache = yield* QueryCache.make({ isServer: false });
			const failed = vi.fn();
			cache.subscribeUnsafe((event) => {
				if (event.type === "failed") {
					failed(event.error);
				}
			});

			const exit = yield* Effect.exit(
				cache.fetch(() =>
					queryOptions({ queryFn, queryKey: ["bug"], retry: 3 }),
				),
			);

			expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
			expect(queryFn).toHaveBeenCalledOnce();
			expect(failed).toHaveBeenCalledWith(new Error("bug"));
		}),
	);

	it.effect("fetch fails with a CancelledError when the entry is removed", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const cache = yield* QueryCache.make({ isServer: false });
			const fiber = yield* Effect.forkChild(
				Effect.flip(cache.fetch(backend.issueQuery, { id: 1 })),
				{ startImmediately: true },
			);

			yield* cache.remove(backend.issueQuery, { id: 1 });

			const error = yield* Fiber.join(fiber);
			expect(error).toBeInstanceOf(Query.CancelledError);
			expect(backend.requests[0]?.signal.aborted).toBe(true);
		}),
	);

	it.effect("getData is None until the entry has data", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const cache = yield* QueryCache.make({ isServer: false });
			yield* cache.getQuery(backend.issueQuery, { id: 1 });
			expect(
				Option.isNone(yield* cache.getData(backend.issueQuery, { id: 1 })),
			).toBe(true);

			yield* cache.setData(backend.issueQuery, { id: 1 }, (issue) => ({
				id: 1,
				title: issue?.title ?? "Written",
			}));

			const data = yield* cache.getData(backend.issueQuery, { id: 1 });
			expect(Option.getOrUndefined(data)?.title).toBe("Written");
		}),
	);

	it.effect("events stream every cache change", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const cache = yield* QueryCache.make({ isServer: false });
			const fiber = yield* Effect.forkChild(
				cache.events.pipe(
					Stream.map((event) => `${event.type} ${event.query.hash}`),
					Stream.take(3),
					Stream.runCollect,
				),
				{ startImmediately: true },
			);

			yield* cache.prefetch(backend.issueQuery, { id: 1 });
			yield* cache.clear;

			expect(yield* Fiber.join(fiber)).toEqual([
				'added ["issue",1]',
				'updated ["issue",1]',
				'removed ["issue",1]',
			]);
		}),
	);

	it.effect("reset drops data and refetches what watch is reading", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const cache = yield* QueryCache.make({ isServer: false });
			yield* cache.setData(
				backend.issueQuery,
				{ id: 1 },
				{ id: 1, title: "A" },
			);
			const fiber = yield* forkStarted(
				cache.watch(backend.issueQuery, { id: 1 }),
				(stream) =>
					stream.pipe(
						Stream.map((state) => state.data?.title),
						Stream.take(3),
						Stream.runCollect,
					),
			);

			const reset = yield* Effect.forkChild(
				cache.reset(backend.issueQuery, { id: 1 }),
				{ startImmediately: true },
			);
			yield* settle;
			backend.respondAll();
			yield* Fiber.join(reset);

			const titles = yield* Fiber.join(fiber);
			expect(titles).toEqual(["A", undefined, "First"]);
		}),
	);

	it.effect("watch streams the current state, then every change", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const cache = yield* QueryCache.make({ isServer: false });
			yield* cache.setData(
				backend.issueQuery,
				{ id: 1 },
				{ id: 1, title: "A" },
			);
			const fiber = yield* forkStarted(
				cache.watch(backend.issueQuery, { id: 1 }),
				(stream) =>
					stream.pipe(
						Stream.map((state) => state.data?.title),
						Stream.take(2),
						Stream.runCollect,
					),
			);

			yield* cache.setData(
				backend.issueQuery,
				{ id: 1 },
				{ id: 1, title: "B" },
			);

			const titles = yield* Fiber.join(fiber);
			expect(titles).toEqual(["A", "B"]);
		}),
	);

	it.effect("invalidate refetches what watch is reading", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const cache = yield* QueryCache.make({ isServer: false });
			yield* cache.setData(
				backend.issueQuery,
				{ id: 1 },
				{ id: 1, title: "A" },
			);
			const fiber = yield* forkStarted(
				cache.watch(backend.issueQuery, { id: 1 }),
				(stream) =>
					stream.pipe(
						Stream.filter((state) => state.data?.title === "C"),
						Stream.take(1),
						Stream.runCollect,
					),
			);

			const invalidated = yield* Effect.forkChild(
				cache.invalidate({ queryKey: ["issue"] }),
				{ startImmediately: true },
			);
			yield* settle;
			backend.issues.set(1, { id: 1, title: "C" });
			backend.respondAll();
			yield* Fiber.join(invalidated);

			const states = yield* Fiber.join(fiber);
			expect(states).toHaveLength(1);
		}),
	);

	it.effect(
		"mount listens to the platform while any mounting scope is open",
		() =>
			Effect.gen(function* () {
				const platform = fakePlatform();
				const backend = createBackend();
				const cache = yield* QueryCache.make({ isServer: false }).pipe(
					Effect.provideService(Platform.Platform, platform),
				);
				const query = cache.getQueryUnsafe(backend.issueQuery, { id: 1 });
				Query.subscribeUnsafe(query, () => {});
				Query.readUnsafe(query);
				backend.respondAll();
				yield* settle;

				const first = yield* Scope.make();
				const second = yield* Scope.make();
				yield* cache.mount.pipe(Scope.provide(first));
				yield* cache.mount.pipe(Scope.provide(second));
				yield* Scope.close(first, Exit.void);
				platform.emit("online");
				expect(backend.requests).toHaveLength(1);
				backend.respondAll();
				yield* settle;

				yield* Scope.close(second, Exit.void);
				platform.emit("online");
				expect(backend.requests).toHaveLength(0);
			}),
	);

	it.effect("retries wait for the platform to come back online", () =>
		Effect.gen(function* () {
			const platform = fakePlatform({ online: false });
			let calls = 0;
			const cache = yield* QueryCache.make({ isServer: false }).pipe(
				Effect.provideService(Platform.Platform, platform),
			);
			const fiber = yield* Effect.forkChild(
				cache.fetch(() =>
					queryOptions({
						queryFn: () => {
							calls++;
							return calls === 1 ? Promise.reject(new Error("down")) : "ok";
						},
						queryKey: ["offline"],
						retryDelay: 1000,
					}),
				),
				{ startImmediately: true },
			);
			yield* settle;

			yield* TestClock.adjust("1 minute");
			expect(calls).toBe(1);

			platform.emit("online");
			expect(yield* Fiber.join(fiber)).toBe("ok");
			expect(calls).toBe(2);
		}),
	);

	it.effect(
		"stale data refetches on focus once staleTime passes on the Clock",
		() =>
			Effect.gen(function* () {
				const platform = fakePlatform();
				const backend = createBackend();
				const cache = yield* QueryCache.make({
					defaults: { staleTime: 10_000 },
					isServer: false,
				}).pipe(Effect.provideService(Platform.Platform, platform));
				yield* cache.mount;
				yield* cache.setData(
					backend.issueQuery,
					{ id: 1 },
					{ id: 1, title: "A" },
				);
				const query = cache.getQueryUnsafe(backend.issueQuery, { id: 1 });
				Query.subscribeUnsafe(query, () => {});

				platform.emit("focus");
				expect(backend.requests).toHaveLength(0);

				yield* TestClock.adjust("11 seconds");
				expect(Query.getUnsafe(query).isStale).toBe(true);
				platform.emit("focus");
				expect(backend.requests).toHaveLength(1);
			}),
	);

	it.effect("hydrate resumes a dehydrated request", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const server = yield* QueryCache.make({ isServer: true });
			const browser = yield* QueryCache.make({ isServer: false });
			yield* server.prefetch(backend.issueQuery, { id: 1 });

			yield* browser.hydrate(yield* server.dehydrate());
			const fiber = yield* Effect.forkChild(
				browser.fetch(backend.issueQuery, { id: 1 }),
				{ startImmediately: true },
			);
			backend.respondAll();

			expect(yield* Fiber.join(fiber)).toEqual({ id: 1, title: "First" });
			expect(backend.requests).toHaveLength(0);
		}),
	);

	it.effect("a resumed request's rejection is a defect", () =>
		Effect.gen(function* () {
			const browser = yield* QueryCache.make({ isServer: false });
			const promise = Promise.reject(new Error("Query failed"));
			promise.catch(() => {});

			yield* browser.hydrate({
				queries: [{ key: ["typed-issue", 1], promise, updatedAt: 0 }],
			});
			const exit = yield* Effect.exit(browser.fetch(issueQuery, { id: 1 }));

			expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
		}),
	);

	it.effect("dehydrateQuery sends data, or the pending promise", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const cache = yield* QueryCache.make({ isServer: true });
			yield* cache.setData(
				backend.issueQuery,
				{ id: 1 },
				{ id: 1, title: "A" },
			);
			yield* cache.prefetch(backend.issueQuery, { id: 2 });

			const settled = yield* dehydrateQuery(
				yield* cache.getQuery(backend.issueQuery, { id: 1 }),
			);
			const pending = yield* dehydrateQuery(
				yield* cache.getQuery(backend.issueQuery, { id: 2 }),
			);

			expect(settled).toMatchObject({ data: { id: 1, title: "A" } });
			expect(pending.promise).toBeInstanceOf(Promise);
		}),
	);

	it.effect("dehydrate skips and records what `sent` holds", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const cache = yield* QueryCache.make({ isServer: true });
			yield* cache.prefetch(backend.issueQuery, { id: 1 });
			const sent = new Set<string>();

			const first = yield* cache.dehydrate({ sent });
			yield* cache.prefetch(backend.issueQuery, { id: 2 });
			const second = yield* cache.dehydrate({ sent });

			expect(first.queries.map((query) => query.key)).toEqual([["issue", 1]]);
			expect(second.queries.map((query) => query.key)).toEqual([["issue", 2]]);
			expect([...sent]).toEqual(['["issue",1]', '["issue",2]']);
		}),
	);

	it.effect(
		"a failed pending query reaches the receiver as a RedactedError",
		() =>
			Effect.gen(function* () {
				const backend = createBackend();
				const cache = yield* QueryCache.make({ isServer: true });
				yield* cache.prefetch(backend.issueQuery, { id: 404 });
				const promise = (yield* cache.dehydrate()).queries[0]?.promise;
				backend.respondAll();

				const reason = yield* Effect.promise(async () => {
					try {
						await promise;
						return undefined;
					} catch (error: unknown) {
						return error;
					}
				});

				expect(reason).toBeInstanceOf(RedactedError);
				expect(reason).toEqual(new RedactedError({ hash: '["issue",404]' }));
				expect(reason).toHaveProperty("message", 'Query ["issue",404] failed');
			}),
	);

	it.effect(
		"dehydrateStream sends the cache, then each entry once, in batches",
		() =>
			Effect.gen(function* () {
				const backend = createBackend();
				for (const id of [3, 4, 5]) {
					backend.issues.set(id, { id, title: `Issue ${id}` });
				}
				const cache = yield* QueryCache.make({ isServer: true });
				yield* cache.setData(
					backend.issueQuery,
					{ id: 1 },
					{ id: 1, title: "A" },
				);
				yield* cache.prefetch(backend.issueQuery, { id: 2 });
				const scope = yield* Scope.make();
				const stream = yield* cache
					.dehydrateStream()
					.pipe(Scope.provide(scope));
				const fiber = yield* Effect.forkChild(
					Stream.runCollect(stream.updates),
					{ startImmediately: true },
				);

				yield* cache.prefetch(backend.issueQuery, { id: 3 });
				yield* cache.prefetch(backend.issueQuery, { id: 4 });
				yield* settle;
				backend.respondAll();
				yield* settle;
				// Changed in the scope's last tick: still sent before the end.
				yield* cache.prefetch(backend.issueQuery, { id: 5 });
				yield* Scope.close(scope, Exit.void);

				const ids = (state: DehydratedState) =>
					state.queries.map((query) => query.key[1]);
				expect(ids(stream.initial)).toEqual([1, 2]);
				expect((yield* Fiber.join(fiber)).map(ids)).toEqual([[3, 4], [5]]);
			}),
	);

	it.effect(
		"dehydrateStream hands a batch to its reader in the microtask",
		() =>
			Effect.gen(function* () {
				const backend = createBackend();
				const cache = yield* QueryCache.make({ isServer: true });
				const stream = yield* cache.dehydrateStream();
				const received: Array<DehydratedState> = [];
				yield* Effect.forkChild(
					Stream.runForEach(stream.updates, (state) =>
						Effect.sync(() => received.push(state)),
					),
					{ startImmediately: true },
				);

				yield* cache.prefetch(backend.issueQuery, { id: 1 });
				expect(received).toHaveLength(0);
				yield* Effect.promise(() => Promise.resolve());

				expect(received).toHaveLength(1);
			}),
	);

	it.effect("hydrateStream resumes requests the server started later", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const server = yield* QueryCache.make({ isServer: true });
			const browser = yield* QueryCache.make({ isServer: false });
			// `updatedAt: 0` means pending to `hydrate`.
			yield* TestClock.adjust("1 second");
			yield* server.setData(
				backend.issueQuery,
				{ id: 1 },
				{ id: 1, title: "A" },
			);
			const scope = yield* Scope.make();
			const stream = yield* server.dehydrateStream().pipe(Scope.provide(scope));
			yield* browser.hydrate(stream.initial);
			const hydrating = yield* Effect.forkChild(
				browser.hydrateStream(stream.updates),
				{ startImmediately: true },
			);

			yield* server.prefetch(backend.issueQuery, { id: 2 });
			yield* settle;
			const fetched = yield* Effect.forkChild(
				browser.fetch(backend.issueQuery, { id: 2 }),
				{ startImmediately: true },
			);
			backend.respondAll();
			yield* Scope.close(scope, Exit.void);
			yield* Fiber.join(hydrating);

			const cached = yield* browser.getData(backend.issueQuery, { id: 1 });
			expect(Option.getOrUndefined(cached)?.title).toBe("A");
			expect(yield* Fiber.join(fetched)).toEqual({ id: 2, title: "Second" });
			expect(backend.requests).toHaveLength(0);
		}),
	);
});

describe("QueryCache filters", () => {
	function issuesQuery(input: { projectId: number; status: string }) {
		return queryOptions({
			queryFn: () => [],
			queryKey: ["issues", input],
			staleTime: Infinity,
		});
	}
	function labelsQuery(input: { projectId: number }) {
		return queryOptions({
			queryFn: () => [],
			queryKey: ["labels", input.projectId],
			staleTime: Infinity,
		});
	}
	const inputIs = (name: string, value: unknown) => (query: Query.Query) =>
		Predicate.hasProperty(query.handle.input, name) &&
		query.handle.input[name] === value;

	const seed = Effect.fnUntraced(function* () {
		const cache = yield* QueryCache.make({ isServer: false });
		yield* cache.setData(issuesQuery, { projectId: 3, status: "open" }, []);
		yield* cache.setData(issuesQuery, { projectId: 3, status: "closed" }, []);
		yield* cache.setData(issuesQuery, { projectId: 4, status: "open" }, []);
		yield* cache.setData(labelsQuery, { projectId: 3 }, []);
		return cache;
	});
	const hashesWhere = (
		cache: QueryCache.QueryCache,
		keep: (state: Query.State<unknown>) => boolean,
	) =>
		Effect.map(cache.all, (queries) =>
			queries
				.filter((query) => keep(Query.getUnsafe(query)))
				.map((query) => query.hash),
		);

	it.effect("predicate narrows a key-prefix match", () =>
		Effect.gen(function* () {
			const cache = yield* seed();

			yield* cache.invalidate({
				predicate: inputIs("status", "open"),
				queryKey: ["issues"],
			});

			expect(yield* hashesWhere(cache, (state) => state.isInvalidated)).toEqual(
				[
					'["issues",{"projectId":3,"status":"open"}]',
					'["issues",{"projectId":4,"status":"open"}]',
				],
			);
		}),
	);

	it.effect("predicate alone matches across keys, by handle input", () =>
		Effect.gen(function* () {
			const cache = yield* seed();

			yield* cache.invalidate({ predicate: inputIs("projectId", 3) });

			expect(yield* hashesWhere(cache, (state) => state.isInvalidated)).toEqual(
				[
					'["issues",{"projectId":3,"status":"open"}]',
					'["issues",{"projectId":3,"status":"closed"}]',
					'["labels",3]',
				],
			);
		}),
	);

	it.effect("an empty filter matches every entry", () =>
		Effect.gen(function* () {
			const cache = yield* seed();

			yield* cache.invalidate({});

			expect(
				yield* hashesWhere(cache, (state) => state.isInvalidated),
			).toHaveLength(4);
		}),
	);

	it.effect("reset applies the predicate", () =>
		Effect.gen(function* () {
			const cache = yield* seed();

			yield* cache.reset({ predicate: inputIs("projectId", 4) });

			expect(yield* hashesWhere(cache, (state) => state.hasData)).toEqual([
				'["issues",{"projectId":3,"status":"open"}]',
				'["issues",{"projectId":3,"status":"closed"}]',
				'["labels",3]',
			]);
		}),
	);

	it.effect("remove applies the predicate", () =>
		Effect.gen(function* () {
			const cache = yield* seed();
			Query.subscribeUnsafe(
				cache.getQueryUnsafe(labelsQuery, { projectId: 3 }),
				() => {},
			);

			yield* cache.remove({
				predicate: (query) => Query.observerCountUnsafe(query) === 0,
			});

			expect(yield* hashesWhere(cache, () => true)).toEqual(['["labels",3]']);
		}),
	);

	it.effect("a hydrated-only entry has no input yet", () =>
		Effect.gen(function* () {
			const cache = yield* QueryCache.make({ isServer: false });
			yield* cache.hydrate({
				queries: [{ data: [], key: ["labels", 3], updatedAt: 1 }],
			});

			yield* cache.remove({ predicate: inputIs("projectId", 3) });
			expect(yield* cache.all).toHaveLength(1);
			yield* cache.remove({ predicate: (query) => query.key[1] === 3 });
			expect(yield* cache.all).toHaveLength(0);
		}),
	);

	it("passes the predicate a Query", () => {
		expectTypeOf<QueryCache.Filter["predicate"]>().toEqualTypeOf<
			((query: Query.Query) => boolean) | undefined
		>();
		const removeAll = (cache: QueryCache.QueryCache) =>
			cache.remove({
				predicate: (query) => {
					expectTypeOf(query).toEqualTypeOf<Query.Query>();
					return true;
				},
			});
		expectTypeOf(removeAll).returns.toEqualTypeOf<Effect.Effect<void>>();
	});
});
