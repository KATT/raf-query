import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import {
	QueryClient,
	type QueryHandle,
	type QueryHandleWithData,
	QueryProvider,
	type Thenable,
	useQuery,
} from "@raf-query/react";
import { Layer, type Result } from "effect";
import type { ComponentProps } from "react";

import { type NotFound, nameQuery, titleQuery } from "../queries.ts";

declare module "@raf-query/react" {
	interface Register {
		throwOnError: true;
	}
}

describe("Register throwOnError: true", () => {
	it("types reads that omit the flag as throwing, and the flag still wins", () => {
		const useTypes = (
			handle: QueryHandle<typeof nameQuery>,
			withData: QueryHandleWithData<typeof nameQuery>,
			title: QueryHandle<typeof titleQuery>,
		) => {
			const [name] = useQuery(nameQuery, handle);
			expectTypeOf(name).toEqualTypeOf<Thenable<string>>();
			const [data] = useQuery(nameQuery, withData);
			expectTypeOf(data).toEqualTypeOf<string>();
			const [result] = useQuery(nameQuery, handle, { throwOnError: false });
			expectTypeOf(result).toEqualTypeOf<
				Thenable<Result.Result<string, NotFound>>
			>();
			const [titlePromise] = useQuery(titleQuery, title);
			expectTypeOf(titlePromise).toEqualTypeOf<Thenable<string>>();
		};
		expect(useTypes).toBeTypeOf("function");
	});

	it("requires every client to be given throwOnError: true", () => {
		const client = new QueryClient({ layer: Layer.empty, throwOnError: true });
		expect(client.throwOnError).toBe(true);
		// @ts-expect-error -- the registered default needs the client's flag
		expectTypeOf(() => new QueryClient({ layer: Layer.empty })).toBeFunction();
		// @ts-expect-error -- the config is required too
		expectTypeOf(() => new QueryClient()).toBeFunction();
		expectTypeOf(
			// @ts-expect-error -- and it must match the registered default
			() => new QueryClient({ throwOnError: false }),
		).toBeFunction();
		expectTypeOf<ComponentProps<typeof QueryProvider>["config"]>()
			.exclude<undefined>()
			.toHaveProperty("throwOnError")
			.toEqualTypeOf<true>();
		expectTypeOf<
			undefined extends ComponentProps<typeof QueryProvider>["config"]
				? true
				: false
		>().toEqualTypeOf<false>();
	});
});
