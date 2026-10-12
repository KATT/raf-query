import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";

import { QueryClient } from "./index.ts";
import { createBackend, flush } from "./test-utils.ts";

const settle = Effect.promise(flush);

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

	it.effect("watch streams the current state, then every change", () =>
		Effect.gen(function* () {
			const backend = createBackend();
			const qc = new QueryClient({ isServer: false });
			qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
			const fiber = yield* Effect.forkChild(
				qc.effect.watch(backend.issueQuery, { id: 1 }).pipe(
					Stream.map((state) => state.data?.title),
					Stream.take(2),
					Stream.runCollect,
				),
				{ startImmediately: true },
			);
			yield* settle;

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
			const fiber = yield* Effect.forkChild(
				qc.effect.watch(backend.issueQuery, { id: 1 }).pipe(
					Stream.filter((state) => state.data?.title === "C"),
					Stream.take(1),
					Stream.runCollect,
				),
				{ startImmediately: true },
			);
			yield* settle;

			const invalidated = yield* Effect.forkChild(
				qc.effect.invalidate({ queryKey: ["issue"] }),
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
