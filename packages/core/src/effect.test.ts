import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Stream } from "effect";

import { CancelledError, QueryClient } from "./index.ts";
import { createBackend, flush } from "./test-utils.ts";

const settle = Effect.promise(flush);

/**
 * Fork `consume(stream)` and wait for the stream's first element, so the
 * watch it reads from is subscribed.
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

describe("QueryClient.effect", () => {
	it.effect("ensure and fetch succeed with the handle and the data", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const qc = new QueryClient({ isServer: false });
			const fiber = yield* Effect.forkChild(
				Effect.all([
					qc.effect.ensure(backend.issueQuery, { id: 1 }),
					qc.effect.fetch(backend.issueQuery, { id: 1 }),
				]),
			);
			yield* settle;
			backend.respondAll();

			const [handle, issue] = yield* Fiber.join(fiber);

			expect(handle.key).toEqual(["issue", 1]);
			expect(issue.title).toBe("First");
		}),
	);

	it.effect("fetch fails with the request's error", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const qc = new QueryClient({ isServer: false });
			const fiber = yield* Effect.forkChild(
				Effect.flip(qc.effect.fetch(backend.issueQuery, { id: 404 })),
			);
			yield* settle;
			backend.respondAll();

			const error = yield* Fiber.join(fiber);

			expect(String(error)).toContain("No issue 404");
		}),
	);

	it.effect("fetch fails with a CancelledError when the entry is removed", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const qc = new QueryClient({ isServer: false });
			const fiber = yield* Effect.forkChild(
				Effect.flip(qc.effect.fetch(backend.issueQuery, { id: 1 })),
				{ startImmediately: true },
			);

			qc.remove(backend.issueQuery, { id: 1 });

			const error = yield* Fiber.join(fiber);
			expect(error).toBeInstanceOf(CancelledError);
			expect(backend.requests[0]?.signal.aborted).toBe(true);
		}),
	);

	it.effect("reset drops data and refetches what watch is reading", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const qc = new QueryClient({ isServer: false });
			qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
			const fiber = yield* forkStarted(
				qc.effect.watch(backend.issueQuery, { id: 1 }),
				(stream) =>
					stream.pipe(
						Stream.map((state) => state.data?.title),
						Stream.take(3),
						Stream.runCollect,
					),
			);

			const reset = yield* Effect.forkChild(
				qc.effect.reset(backend.issueQuery, { id: 1 }),
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
			const qc = new QueryClient({ isServer: false });
			qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
			const fiber = yield* forkStarted(
				qc.effect.watch(backend.issueQuery, { id: 1 }),
				(stream) =>
					stream.pipe(
						Stream.map((state) => state.data?.title),
						Stream.take(2),
						Stream.runCollect,
					),
			);

			qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "B" });

			const titles = yield* Fiber.join(fiber);
			expect(titles).toEqual(["A", "B"]);
		}),
	);

	it.effect("invalidate refetches what watch is reading", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const qc = new QueryClient({ isServer: false });
			qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
			const fiber = yield* forkStarted(
				qc.effect.watch(backend.issueQuery, { id: 1 }),
				(stream) =>
					stream.pipe(
						Stream.filter((state) => state.data?.title === "C"),
						Stream.take(1),
						Stream.runCollect,
					),
			);

			const invalidated = yield* Effect.forkChild(
				qc.effect.invalidate({ queryKey: ["issue"] }),
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
});
