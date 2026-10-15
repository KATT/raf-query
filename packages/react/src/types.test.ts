import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";
import type { ComponentProps } from "react";

import {
	allKeyed,
	type DataOf,
	dehydrate,
	type ErrorOf,
	type InfiniteData,
	infiniteQueryOptions,
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	type QueryHandleWithData,
	type QueryOptions,
	queryOptions,
	type ServicesOf,
	useQuery,
	useWaterfall,
} from "./index.ts";

describe("allKeyed", () => {
	it("awaits a record of promises, keeping keys", async () => {
		const result = await allKeyed({
			one: Promise.resolve(1),
			two: "two",
		});

		expect(result).toEqual({ one: 1, two: "two" });
		expectTypeOf(result).toEqualTypeOf<{ one: number; two: string }>();
	});

	it("rejects on the first failure", async () => {
		await expect(
			allKeyed({ bad: Promise.reject(new Error("no")), good: 1 }),
		).rejects.toThrow("no");
	});
});

function postQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => ({ slug: input.slug, title: "Hello" }),
		queryKey: ["post", input.slug],
	});
}

function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		getNextPageParam: (lastPage: { next: number | null }) => lastPage.next,
		initialPageParam: 0,
		queryFn: (context) => ({ next: context.pageParam + 1 }),
		queryKey: ["comments", input.slug],
	});
}

function meQuery() {
	return queryOptions({ queryFn: () => "me", queryKey: ["me"] });
}

class Api extends Context.Service<
	Api,
	{ readonly user: (id: number) => Effect.Effect<string> }
>()("test/Api") {}

class Other extends Context.Service<Other, string>()("test/Other") {}

class NotFound {
	readonly _tag = "NotFound";
}

function userQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.gen(function* () {
				const api = yield* Api;
				if (input.id < 0) {
					return yield* Effect.fail(new NotFound());
				}
				return yield* api.user(input.id);
			}),
		queryKey: ["user", input.id],
	});
}

function otherQuery() {
	return queryOptions({
		queryFn: () => Effect.service(Other),
		queryKey: ["other"],
	});
}

const apiLayer = Layer.succeed(Api, { user: (id) => Effect.succeed(`#${id}`) });

describe("types", () => {
	it("flow from the factory to every Promise verb", () => {
		const qc = new QueryClient({ isServer: true });

		expectTypeOf(qc.prefetch(postQuery, { slug: "a" })).toEqualTypeOf<
			QueryHandle<typeof postQuery>
		>();
		expectTypeOf(qc.prefetch(postQuery, { slug: "a" }).input).toEqualTypeOf<{
			slug: string;
		}>();
		expectTypeOf(qc.fetch(postQuery, { slug: "a" })).resolves.toEqualTypeOf<
			QueryHandleWithData<typeof postQuery>
		>();
		expectTypeOf(qc.ensure(postQuery, { slug: "a" })).resolves.toEqualTypeOf<
			QueryHandleWithData<typeof postQuery>
		>();
		expectTypeOf<
			QueryHandleWithData<typeof postQuery>["data"]
		>().toEqualTypeOf<{
			slug: string;
			title: string;
		}>();
		expectTypeOf<DataOf<typeof commentsQuery>>().toEqualTypeOf<
			InfiniteData<{ page: { next: number | null }; pageParam: number }>
		>();
		expectTypeOf(qc.prefetch(meQuery).input).toEqualTypeOf<undefined>();
	});

	it("reject wrong inputs and paging options on plain factories", () => {
		const qc = new QueryClient({ isServer: true });
		const typeOnly = () => {
			// @ts-expect-error the input is required
			qc.prefetch(postQuery);
			// @ts-expect-error wrong input shape
			qc.prefetch(postQuery, { id: 1 });
			// @ts-expect-error `pages` is only for paged factories
			void qc.ensure(postQuery, { slug: "a" }, { pages: 2 });
			void qc.ensure(commentsQuery, { slug: "a" }, { pages: 2 });
			// @ts-expect-error wrong input shape
			void qc.invalidate(postQuery, { id: 1 });
			void qc.invalidate({ queryKey: ["post"] });
			// @ts-expect-error factories take at most one argument
			qc.prefetch((a: string, b: string) => postQuery({ slug: a + b }), "a");
		};
		expect(typeOnly).toBeTypeOf("function");
	});

	it("keep handles of branded factories with the same signature apart", () => {
		const article = Symbol("article");
		const draft = Symbol("draft");
		const articleComments = Symbol("article comments");
		const draftComments = Symbol("draft comments");
		function articleQuery(input: { slug: string }) {
			return queryOptions({
				brand: article,
				queryFn: () => ({ slug: input.slug, title: "Hello" }),
				queryKey: ["article", input.slug],
			});
		}
		function draftQuery(input: { slug: string }) {
			return queryOptions({
				brand: draft,
				queryFn: () => ({ slug: input.slug, title: "Draft" }),
				queryKey: ["draft", input.slug],
			});
		}
		function articleCommentsQuery(input: { slug: string }) {
			return infiniteQueryOptions({
				brand: articleComments,
				getNextPageParam: (lastPage: { next: number | null }) => lastPage.next,
				initialPageParam: 0,
				queryFn: (context) => ({ next: context.pageParam + 1 }),
				queryKey: ["article-comments", input.slug],
			});
		}
		function draftCommentsQuery(input: { slug: string }) {
			return infiniteQueryOptions({
				brand: draftComments,
				getNextPageParam: (lastPage: { next: number | null }) => lastPage.next,
				initialPageParam: 0,
				queryFn: (context) => ({ next: context.pageParam + 1 }),
				queryKey: ["draft-comments", input.slug],
			});
		}
		expectTypeOf(articleQuery({ slug: "a" })).toEqualTypeOf<
			QueryOptions<{
				brand: typeof article;
				data: { slug: string; title: string };
			}>
		>();
		const qc = new QueryClient({ isServer: true });
		const articleHandle = qc.prefetch(articleQuery, { slug: "a" });
		const commentsHandle = qc.prefetch(articleCommentsQuery, { slug: "a" });
		const unbrandedHandle = qc.prefetch(postQuery, { slug: "a" });
		expectTypeOf(articleHandle).not.toExtend<QueryHandle<typeof draftQuery>>();
		expectTypeOf(articleHandle).not.toExtend<QueryHandle<typeof postQuery>>();
		expectTypeOf(unbrandedHandle).not.toExtend<
			QueryHandle<typeof articleQuery>
		>();
		expectTypeOf(commentsHandle).not.toExtend<
			QueryHandle<typeof draftCommentsQuery>
		>();
		expectTypeOf(articleHandle).toExtend<QueryHandle>();

		function useTypeOnly() {
			// @ts-expect-error the handle is `articleQuery`'s
			useQuery(draftQuery, articleHandle);
			// @ts-expect-error the handle is `articleQuery`'s
			useQuery(postQuery, articleHandle);
			// @ts-expect-error the handle is the unbranded `postQuery`'s
			useQuery(articleQuery, unbrandedHandle);
			// @ts-expect-error the handle is `articleCommentsQuery`'s
			useQuery(draftCommentsQuery, commentsHandle);
			const [data] = useQuery(articleQuery, articleHandle);
			expectTypeOf(data).resolves.toEqualTypeOf<{
				slug: string;
				title: string;
			}>();
		}
		expect(useTypeOnly).toBeTypeOf("function");
	});

	it("infer a queryFn Effect's services and error", () => {
		expectTypeOf(userQuery({ id: 1 })).toEqualTypeOf<
			QueryOptions<{
				brand: undefined;
				data: string;
				error: NotFound;
				services: Api;
			}>
		>();
		expectTypeOf(otherQuery()).toEqualTypeOf<
			QueryOptions<{
				brand: undefined;
				data: string;
				error: never;
				services: Other;
			}>
		>();
		expectTypeOf(postQuery({ slug: "a" })).toEqualTypeOf<
			QueryOptions<{ brand: undefined; data: { slug: string; title: string } }>
		>();
		expectTypeOf<ServicesOf<typeof userQuery>>().toEqualTypeOf<Api>();
		expectTypeOf<ErrorOf<typeof userQuery>>().toEqualTypeOf<NotFound>();
		expectTypeOf<DataOf<typeof userQuery>>().toEqualTypeOf<string>();
		expectTypeOf<ServicesOf<typeof postQuery>>().toEqualTypeOf<never>();
	});

	it("take only factories whose services the client's layer provides", () => {
		const qc = new QueryClient({ isServer: true, layer: apiLayer });
		const plain = new QueryClient({ isServer: true });
		expectTypeOf(qc).toEqualTypeOf<QueryClient<Api>>();
		const typeOnly = () => {
			void qc.fetch(userQuery, { id: 1 });
			qc.prefetch(postQuery, { slug: "a" });
			// @ts-expect-error `Other` isn't in the client's layer
			void qc.ensure(otherQuery);
			// @ts-expect-error the client has no layer
			void plain.fetch(userQuery, { id: 1 });
			// @ts-expect-error the client has no layer
			plain.prefetch(userQuery, { id: 1 });
			// @ts-expect-error the client has no layer
			void plain.invalidate(userQuery, { id: 1 });
		};
		expect(typeOnly).toBeTypeOf("function");
	});

	it("infer generic factory makers passed inline", async () => {
		/** A typed endpoint name, as a generated API client would export. */
		interface Endpoint<TArgs, TData> {
			readonly args?: TArgs;
			readonly data?: TData;
			readonly name: string;
		}
		function endpointQuery<TArgs, TData>(endpoint: Endpoint<TArgs, TData>) {
			return (args: TArgs) =>
				queryOptions({
					queryFn: (): TData => {
						throw new Error(`${endpoint.name} isn't implemented`);
					},
					queryKey: [endpoint.name, args],
				});
		}
		function endpointPagesQuery<TArgs, TPage>(
			endpoint: Endpoint<TArgs, TPage>,
		) {
			return (args: TArgs) =>
				infiniteQueryOptions({
					getNextPageParam: () => null,
					initialPageParam: 0,
					queryFn: (): TPage => {
						throw new Error(`${endpoint.name} isn't implemented`);
					},
					queryKey: [endpoint.name, args],
				});
		}
		function apiQuery<TArgs>(name: string, _args?: TArgs) {
			return (args: TArgs) =>
				queryOptions({
					queryFn: () =>
						Effect.gen(function* () {
							const api = yield* Api;
							return yield* api.user(1);
						}),
					queryKey: [name, args],
				});
		}
		const getPost: Endpoint<{ slug: string }, { title: string }> = {
			name: "posts.get",
		};
		const listPosts: Endpoint<{ tag: string }, { items: Array<string> }> = {
			name: "posts.list",
		};
		const qc = new QueryClient({ isServer: true });
		qc.setData(endpointQuery(getPost), { slug: "a" }, { title: "Hello" });

		const handle = await qc.ensure(endpointQuery(getPost), { slug: "a" });
		expectTypeOf(handle.input).toEqualTypeOf<{ slug: string }>();
		expectTypeOf(handle.data).toEqualTypeOf<{ title: string }>();
		expectTypeOf(
			qc.getData(endpointQuery(getPost), { slug: "a" }),
		).toEqualTypeOf<{ title: string } | undefined>();
		expectTypeOf(
			qc.prefetch(endpointPagesQuery(listPosts), { tag: "news" }).input,
		).toEqualTypeOf<{ tag: string }>();
		expectTypeOf<
			DataOf<ReturnType<typeof endpointPagesQuery<{ tag: string }, number>>>
		>().toEqualTypeOf<InfiniteData<{ page: number; pageParam: number }>>();
		const withApi = new QueryClient({ isServer: true, layer: apiLayer });
		expectTypeOf(withApi.fetch(apiQuery<{ id: number }>("user"), { id: 1 }))
			.resolves.toHaveProperty("data")
			.toEqualTypeOf<string>();

		function useTypeOnly() {
			void qc.invalidate(endpointQuery(getPost), { slug: "a" });
			const [post] = useQuery(endpointQuery(getPost), handle);
			expectTypeOf(post).toEqualTypeOf<{ title: string }>();
			const pages = useWaterfall(endpointPagesQuery(listPosts), { tag: "a" });
			expectTypeOf(
				useQuery(endpointPagesQuery(listPosts), pages)[1],
			).toHaveProperty("fetchNextPage");
			expectTypeOf(
				qc.ensure(endpointPagesQuery(listPosts), { tag: "a" }, { pages: 2 }),
			).resolves.toHaveProperty("input");
			expectTypeOf(
				qc.fetch(endpointPagesQuery(listPosts), { tag: "a" }, { pages: 2 }),
			)
				.resolves.toHaveProperty("data")
				.toEqualTypeOf<
					InfiniteData<{ page: { items: Array<string> }; pageParam: number }>
				>();
			// @ts-expect-error the input is the endpoint's args
			void qc.ensure(endpointQuery(getPost), { tag: "a" });
			void qc.ensure(
				endpointPagesQuery(listPosts),
				// @ts-expect-error the input is the endpoint's args
				{ slug: "a" },
				{ pages: 2 },
			);
			// @ts-expect-error `pages` is only for paged factories
			void qc.ensure(endpointQuery(getPost), { slug: "a" }, { pages: 2 });
			// @ts-expect-error the client has no layer
			void qc.fetch(apiQuery<{ id: number }>("user"), { id: 1 });
		}
		expect(useTypeOnly).toBeTypeOf("function");
	});

	it("accept a client of any services where any client goes", () => {
		const qc = new QueryClient({ isServer: true, layer: apiLayer });
		expectTypeOf(qc).toExtend<
			ComponentProps<typeof QueryClientProvider>["client"]
		>();
		expectTypeOf(qc).toExtend<Parameters<typeof dehydrate>[0]>();
	});
});
