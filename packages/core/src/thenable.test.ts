import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Cause, Data, Effect, Exit, Option } from "effect";

import {
	exitThenable,
	Query,
	QueryCache,
	queryOptions,
	type Thenable,
} from "./index.ts";
import { makeCacheUnsafe } from "./test-utils.ts";
import { fulfilled, pending } from "./thenable.ts";

describe("Thenable", () => {
	it("narrows on status", () => {
		const thenable = fulfilled(1);
		expectTypeOf(thenable).toEqualTypeOf<Thenable<number>>();
		if (thenable.status === "fulfilled") {
			expectTypeOf(thenable.value).toEqualTypeOf<number>();
		}
	});

	it("types the cache's promises", () => {
		const qc = makeCacheUnsafe({ isServer: false });
		const countQuery = () =>
			queryOptions({ queryFn: () => 1, queryKey: ["count"] });
		Effect.runSync(qc.setData(countQuery, undefined, 1));

		const promise = Query.getUnsafe(qc.getQueryUnsafe(countQuery)).promise;
		expectTypeOf(promise).toEqualTypeOf<Thenable<number>>();
		expect(promise).toMatchObject({ status: "fulfilled", value: 1 });
	});

	it("exitThenable keeps a failed first load's typed failure apart from a defect", async () => {
		class NotFound extends Data.TaggedError("NotFound")<{
			readonly id: number;
		}> {}
		const qc = makeCacheUnsafe({ isServer: false });
		const docQuery = (input: { id: number }) =>
			queryOptions({
				queryFn: () =>
					input.id === 1
						? Effect.fail(new NotFound({ id: 1 }))
						: Effect.die(new Error("exploded")),
				queryKey: ["doc", input.id],
				retry: false,
			});
		const read = (id: number) =>
			exitThenable<unknown, NotFound>(
				Query.readUnsafe(qc.getQueryUnsafe(docQuery, { id })),
			);

		const missing = read(1);
		const crashed = read(2);
		const missingExit = await missing;
		const crashedExit = await crashed;

		expect(missing).toMatchObject({ status: "fulfilled" });
		expect(Exit.findErrorOption(missingExit)).toEqual(
			Option.some(new NotFound({ id: 1 })),
		);
		expect(
			Exit.isFailure(crashedExit) && Cause.hasDies(crashedExit.cause),
		).toBe(true);
		expect(Exit.findErrorOption(crashedExit)).toEqual(Option.none());
		expect(read(1)).toBe(missing);
	});

	it("exitThenable makes a rejection without a Cause a defect", async () => {
		const deferred = pending<number>();
		const exit = exitThenable(deferred.promise);
		deferred.reject(new Error("from the server"));

		const settled = await exit;
		expect(Exit.isFailure(settled) && Cause.hasDies(settled.cause)).toBe(true);
		expect(exitThenable(fulfilled(1))).toMatchObject({
			status: "fulfilled",
			value: Exit.succeed(1),
		});
	});

	it.effect("lets `fetch` succeed with data on a cache miss and a hit", () =>
		Effect.gen(function* () {
			const qc = yield* QueryCache.make({ isServer: false });
			const countQuery = () =>
				queryOptions({ queryFn: async () => 2, queryKey: ["count"] });

			expect((yield* qc.fetch(countQuery)).data).toBe(2);
			expect((yield* qc.fetch(countQuery)).data).toBe(2);
		}),
	);
});
