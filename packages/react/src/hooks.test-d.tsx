import { describe, expectTypeOf, it } from "vitest";

import {
	type ErrorOf,
	type InfiniteData,
	type InfiniteQueryControls,
	type QueryControls,
	type QueryHandle,
	type Result,
	type SingleQueryFactory,
	type Thenable,
	useInfiniteQuery,
	useQuery,
} from "./index.ts";
import { createBackend, type Issue } from "./test-utils.tsx";

type Backend = ReturnType<typeof createBackend>;

declare const backend: Backend;
declare const issueHandle: QueryHandle<Backend["issueQuery"]>;
declare const pagesHandle: QueryHandle<Backend["pageQuery"]>;

describe("useQuery", () => {
	it("reads a thenable of the data, and state with no page fields", () => {
		function Issue() {
			const [issueThenable, issueState] = useQuery(
				backend.issueQuery,
				issueHandle,
			);
			expectTypeOf(issueThenable).toEqualTypeOf<Thenable<Issue>>();
			expectTypeOf(issueState).toEqualTypeOf<
				QueryControls<Backend["issueQuery"]>
			>();
			expectTypeOf(issueState).not.toHaveProperty("fetchNextPage");
			expectTypeOf(issueState).not.toHaveProperty("hasNextPage");
			expectTypeOf(issueState).not.toHaveProperty("isFetchingNextPage");
			return null;
		}
		expectTypeOf(Issue).toBeFunction();
	});

	it("rejects a paged query's factory and handle", () => {
		function Pages() {
			// @ts-expect-error: paged queries read with `useInfiniteQuery`
			useQuery(backend.pageQuery, pagesHandle);
			// @ts-expect-error: a paged handle isn't this factory's handle
			useQuery(backend.issueQuery, pagesHandle);
			return null;
		}
		expectTypeOf(Pages).toBeFunction();
	});

	it("is callable from a hook generic over single-query factories", () => {
		function useTitle<TFactory extends SingleQueryFactory>(
			factory: TFactory,
			handle: QueryHandle<TFactory>,
		) {
			return useQuery(factory, handle)[1].isFetching;
		}
		expectTypeOf(useTitle).returns.toEqualTypeOf<boolean>();
	});
});

describe("useInfiniteQuery", () => {
	it("reads a thenable of the pages, and state with the page fields", () => {
		function Pages() {
			const [pagesThenable, pagesState] = useInfiniteQuery(
				backend.pageQuery,
				pagesHandle,
			);
			expectTypeOf(pagesThenable).toEqualTypeOf<
				Thenable<InfiniteData<Array<number>, number>>
			>();
			expectTypeOf(pagesState).toEqualTypeOf<
				InfiniteQueryControls<Backend["pageQuery"]>
			>();
			expectTypeOf(pagesState.fetchNextPage).returns.toEqualTypeOf<
				Promise<void>
			>();
			expectTypeOf(pagesState.fetchPreviousPage).returns.toEqualTypeOf<
				Promise<void>
			>();
			expectTypeOf(pagesState.hasNextPage).toEqualTypeOf<boolean>();
			expectTypeOf(pagesState.hasPreviousPage).toEqualTypeOf<boolean>();
			expectTypeOf(pagesState.isFetchingNextPage).toEqualTypeOf<boolean>();
			expectTypeOf(pagesState.isFetchingPreviousPage).toEqualTypeOf<boolean>();
			return null;
		}
		expectTypeOf(Pages).toBeFunction();
	});

	it("reads expected errors as a Result", () => {
		function Pages() {
			const [pagesThenable] = useInfiniteQuery(backend.pageQuery, pagesHandle, {
				result: true,
			});
			expectTypeOf(pagesThenable).toEqualTypeOf<
				Thenable<
					Result<
						InfiniteData<Array<number>, number>,
						ErrorOf<Backend["pageQuery"]>
					>
				>
			>();
			return null;
		}
		expectTypeOf(Pages).toBeFunction();
	});

	it("rejects a single query's factory and handle", () => {
		function Issue() {
			// @ts-expect-error: single queries read with `useQuery`
			useInfiniteQuery(backend.issueQuery, issueHandle);
			// @ts-expect-error: a single query's handle isn't this factory's handle
			useInfiniteQuery(backend.pageQuery, issueHandle);
			return null;
		}
		expectTypeOf(Issue).toBeFunction();
	});
});
