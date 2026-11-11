import { describe, expectTypeOf, it } from "vitest";

import {
	bindQueryOptions,
	bindUseQueryClient,
	createQueryClient,
	group,
	type InfiniteData,
	type InfiniteQueryState,
	invalidateMany,
	type QueryClient,
	type QueryState,
	type QueryHandle,
	polling,
	queryOptions as plainQueryOptions,
	retry,
	type SingleQueryFactory,
	type Thenable,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "./index.ts";
import type { RootOf } from "@raf-query/core/internal";

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
				QueryState<Backend["issueQuery"]>
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

	it("requires a handle: a skipped entry's reader renders only with one", () => {
		function Issue(props: {
			readonly handle: QueryHandle<Backend["issueQuery"]> | undefined;
		}) {
			// @ts-expect-error: a `skipToken` entry's handle may be `undefined`
			useQuery(backend.issueQuery, props.handle);
			return null;
		}
		expectTypeOf(Issue).toBeFunction();
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
				InfiniteQueryState<Backend["pageQuery"]>
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

describe("bindUseQueryClient", () => {
	const makeQueryClient = () => createQueryClient({ parts: [retry()] });
	const queryOptions = bindQueryOptions<typeof makeQueryClient>();
	const useRootClient = bindUseQueryClient<typeof makeQueryClient>();
	const posts = group("posts");
	const postQuery = (input: { readonly id: number }) =>
		queryOptions({
			queryFn: async () => ({ id: input.id }),
			queryKey: posts(input.id),
			retry: 1,
		});
	const makeOtherClient = () => createQueryClient({ parts: [polling()] });
	const otherQuery = () =>
		bindQueryOptions<typeof makeOtherClient>()({
			queryFn: async () => 1,
			queryKey: group("other")(),
			refetchInterval: 1000,
		});

	it("returns a client of the root, whose verbs check factories", () => {
		function Post(props: { readonly handle: QueryHandle<typeof postQuery> }) {
			const [postThenable] = useQuery(postQuery, props.handle);
			const client = useRootClient();
			expectTypeOf(postThenable).toEqualTypeOf<Thenable<{ id: number }>>();
			expectTypeOf(client).toEqualTypeOf<
				QueryClient<RootOf<typeof makeQueryClient>>
			>();
			void invalidateMany(client, postQuery);
			// @ts-expect-error -- otherQuery needs `polling()`, which this client lacks
			void invalidateMany(client, otherQuery);
			return null;
		}
		expectTypeOf(Post).toBeFunction();
	});

	it("leaves the unbound useQueryClient with a client of any root, which runs what needs no part", () => {
		const plainQuery = () =>
			plainQueryOptions({
				queryFn: async () => 1,
				queryKey: group("plain")(),
			});
		function Post() {
			const client = useQueryClient();
			void invalidateMany(client, plainQuery);
			void invalidateMany(client, posts);
			// @ts-expect-error -- any client may lack `retry()`, which postQuery needs
			void invalidateMany(client, postQuery);
			return null;
		}
		expectTypeOf(Post).toBeFunction();
	});
});
