import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import {
	QueryClient,
	type QueryHandle,
	type QueryHandleWithData,
	type Thenable,
	useQuery,
} from "@raf-query/react";
import type { Result } from "effect";

import { type NotFound, nameQuery, titleQuery } from "../queries.ts";

declare module "@raf-query/react" {
	interface Register {
		throwOnError: false;
	}
}

describe("Register throwOnError: false", () => {
	it("types reads that omit the flag as Results, and the flag still wins", () => {
		const useTypes = (
			handle: QueryHandle<typeof nameQuery>,
			withData: QueryHandleWithData<typeof nameQuery>,
			title: QueryHandle<typeof titleQuery>,
		) => {
			const [name] = useQuery(nameQuery, handle);
			expectTypeOf(name).toEqualTypeOf<
				Thenable<Result.Result<string, NotFound>>
			>();
			const [data] = useQuery(nameQuery, withData);
			expectTypeOf(data).toEqualTypeOf<Result.Result<string, NotFound>>();
			const [thrown] = useQuery(nameQuery, handle, { throwOnError: true });
			expectTypeOf(thrown).toEqualTypeOf<Thenable<string>>();
			const [titlePromise] = useQuery(titleQuery, title);
			expectTypeOf(titlePromise).toEqualTypeOf<Thenable<string>>();
		};
		expect(useTypes).toBeTypeOf("function");
	});

	it("requires every client to be given throwOnError: false", () => {
		const client = new QueryClient({ throwOnError: false });
		expect(client.throwOnError).toBe(false);
		// @ts-expect-error -- without a layer the client would throw
		expectTypeOf(() => new QueryClient({})).toBeFunction();
		expectTypeOf(
			// @ts-expect-error -- and it must match the registered default
			() => new QueryClient({ throwOnError: true }),
		).toBeFunction();
	});
});
