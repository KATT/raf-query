import { describe, expect, it, vi } from "@effect/vitest";
import {
	Cause,
	Data,
	Deferred,
	Effect,
	Exit,
	Fiber,
	Option,
	Scope,
	Stream,
} from "effect";
import { TestClock } from "effect/testing";

import {
	dehydrateQuery,
	Platform,
	Query,
	QueryCache,
	queryOptions,
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
});
