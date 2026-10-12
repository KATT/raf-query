import { describe, expect, expectTypeOf, it } from "@effect/vitest";

import { QueryClient, queryOptions, type Thenable, track } from "./index.ts";

describe("track", () => {
	it("records a promise's value once it fulfills", async () => {
		const deferred = Promise.withResolvers<number>();
		const thenable = track(deferred.promise);

		expect(thenable).toBe(deferred.promise);
		expect(thenable.status).toBe("pending");
		deferred.resolve(1);
		await thenable;

		expect(thenable).toMatchObject({ status: "fulfilled", value: 1 });
	});

	it("records a promise's reason once it rejects", async () => {
		const error = new Error("nope");
		const thenable = track(Promise.reject(error));

		await expect(thenable).rejects.toBe(error);
		expect(thenable).toMatchObject({ reason: error, status: "rejected" });
	});

	it("leaves promises that already have a status alone", () => {
		const promise = Object.assign(Promise.resolve(1), {
			status: "fulfilled",
			value: 2,
		});

		expect(track(promise)).toMatchObject({ status: "fulfilled", value: 2 });
	});

	it("narrows on status", () => {
		const thenable = track(Promise.resolve(1));
		expectTypeOf(thenable).toEqualTypeOf<Thenable<number>>();
		if (thenable.status === "fulfilled") {
			expectTypeOf(thenable.value).toEqualTypeOf<number>();
		}
	});

	it("types the cache's promises as thenables", () => {
		const qc = new QueryClient({ isServer: false });
		const countQuery = () =>
			queryOptions({ queryFn: () => 1, queryKey: ["count"] });
		qc.setData(countQuery, undefined, 1);

		const promise = qc.getQuery(countQuery).getState().promise;
		expectTypeOf(promise).toEqualTypeOf<Thenable<number>>();
		expect(promise).toMatchObject({ status: "fulfilled", value: 1 });
	});
});
