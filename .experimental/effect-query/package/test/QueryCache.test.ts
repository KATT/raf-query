import { describe, expect, it } from "@effect/vitest";
import { Cause, Context, Effect, Exit, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";

import { Query, QueryCache } from "../src/index.ts";
import {
	type Behavior,
	Docs,
	docQuery,
	docsLayer,
	NotFound,
} from "./fixtures.ts";

const provide = (behavior: (id: number) => Behavior) =>
	Effect.provide(
		Layer.merge(QueryCache.layer({ gcTime: "1 minute" }), docsLayer(behavior)),
	);

const snapshot = Effect.fnUntraced(function* (
	query: ReturnType<typeof docQuery>,
) {
	const cache = yield* QueryCache.QueryCache;
	const services = yield* Effect.context<Docs>();
	return cache.readUnsafe(query, services);
});

describe("QueryCache", () => {
	it.effect("fetch runs a query once while it is fresh", () =>
		Effect.gen(function* () {
			const query = Query.make({
				effect: Effect.flatMap(Docs, (docs) => docs.get(1)),
				key: ["doc", 1],
				staleTime: "1 minute",
			});
			const first = yield* QueryCache.fetch(query);
			const second = yield* QueryCache.fetch(query);
			expect(first).toEqual({ id: 1, title: "Doc 1" });
			expect(second).toBe(first);
			expect((yield* Docs).calls()).toBe(1);
		}).pipe(provide(() => "ok")),
	);

	it.effect("fetch fails with the query's typed error", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(QueryCache.fetch(docQuery(404)));
			expect(exit).toEqual(Exit.fail(new NotFound({ id: 404 })));
		}).pipe(provide(() => "missing")),
	);

	it.effect("keeps a defect's whole cause, apart from typed failures", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(QueryCache.fetch(docQuery(1)));
			expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
			expect(Exit.isFailure(exit) && Cause.hasFails(exit.cause)).toBe(false);
		}).pipe(provide(() => "die")),
	);

	it.effect("readUnsafe starts the request and settles its promise", () =>
		Effect.gen(function* () {
			const query = Query.make({
				effect: Effect.sleep("1 second").pipe(Effect.as("done")),
				key: ["slow"],
			});
			const cache = yield* QueryCache.QueryCache;
			const pending = cache.readUnsafe(query, Context.empty());
			expect(pending.exit).toBeUndefined();
			expect(pending.isFetching).toBe(true);
			expect(pending.promise).toMatchObject({ status: "pending" });
			yield* TestClock.adjust("1 second");
			// React reads `status` to tell a settled promise from one to suspend on.
			expect(pending.promise).toMatchObject({ status: "fulfilled" });
			yield* Effect.promise(() => pending.promise);
			expect(cache.readUnsafe(query, Context.empty()).exit).toEqual(
				Exit.succeed("done"),
			);
		}).pipe(provide(() => "ok")),
	);

	it.effect("prefetch refetches a failed result from scratch", () =>
		Effect.gen(function* () {
			let behavior: Behavior = "unauthorized";
			yield* Effect.gen(function* () {
				yield* Effect.exit(QueryCache.fetch(docQuery(1)));
				behavior = "ok";
				yield* QueryCache.prefetch(docQuery(1));
				expect((yield* snapshot(docQuery(1))).exit).toEqual(
					Exit.succeed({ id: 1, title: "Doc 1" }),
				);
			}).pipe(provide(() => behavior));
		}),
	);

	it.effect(
		"invalidate refetches read entries, keeping the old result meanwhile",
		() =>
			Effect.gen(function* () {
				let title = "first";
				const query = Query.make({
					effect: Effect.sleep("1 second").pipe(Effect.map(() => title)),
					key: ["title"],
				});
				const cache = yield* QueryCache.QueryCache;
				cache.readUnsafe(query, Context.empty());
				const unsubscribe = cache.subscribeUnsafe(query.hash, () => {});
				yield* TestClock.adjust("1 second");
				title = "second";
				const invalidating = yield* Effect.forkChild(
					QueryCache.invalidate(["title"]),
				);
				yield* Effect.yieldNow;
				const during = cache.readUnsafe(query, Context.empty());
				expect(during.exit).toEqual(Exit.succeed("first"));
				expect(during.isFetching).toBe(true);
				yield* TestClock.adjust("1 second");
				yield* Fiber.join(invalidating);
				expect(cache.readUnsafe(query, Context.empty()).exit).toEqual(
					Exit.succeed("second"),
				);
				unsubscribe();
			}).pipe(provide(() => "ok")),
	);

	it.effect("invalidate drops entries nobody reads", () =>
		Effect.gen(function* () {
			yield* QueryCache.fetch(docQuery(1));
			yield* QueryCache.invalidate(["doc"]);
			yield* QueryCache.fetch(docQuery(1));
			expect((yield* Docs).calls()).toBe(2);
		}).pipe(provide(() => "ok")),
	);

	it.effect("collects an unread entry after gcTime", () =>
		Effect.gen(function* () {
			yield* QueryCache.fetch(docQuery(1));
			yield* TestClock.adjust("59 seconds");
			yield* snapshot(docQuery(1));
			expect((yield* Docs).calls()).toBe(1);
			yield* TestClock.adjust("2 seconds");
			yield* snapshot(docQuery(1));
			expect((yield* Docs).calls()).toBe(2);
		}).pipe(provide(() => "ok")),
	);

	it.effect("keeps an entry someone listens to past gcTime", () =>
		Effect.gen(function* () {
			const cache = yield* QueryCache.QueryCache;
			const unsubscribe = cache.subscribeUnsafe(docQuery(1).hash, () => {});
			yield* QueryCache.fetch(docQuery(1));
			yield* TestClock.adjust("2 minutes");
			yield* snapshot(docQuery(1));
			expect((yield* Docs).calls()).toBe(1);
			unsubscribe();
			yield* TestClock.adjust("2 minutes");
			yield* snapshot(docQuery(1));
			expect((yield* Docs).calls()).toBe(2);
		}).pipe(provide(() => "ok")),
	);

	it.effect("retryUnsafe refetches the failures it matches", () =>
		Effect.gen(function* () {
			let behavior: Behavior = "missing";
			yield* Effect.gen(function* () {
				yield* Effect.exit(QueryCache.fetch(docQuery(1)));
				behavior = "ok";
				const cache = yield* QueryCache.QueryCache;
				cache.retryUnsafe(() => false);
				expect((yield* snapshot(docQuery(1))).exit?._tag).toBe("Failure");
				cache.retryUnsafe((cause) => Cause.hasFails(cause));
				expect((yield* snapshot(docQuery(1))).exit).toEqual(
					Exit.succeed({ id: 1, title: "Doc 1" }),
				);
			}).pipe(provide(() => behavior));
		}),
	);
});
