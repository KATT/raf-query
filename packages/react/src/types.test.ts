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
	queryOptions,
	type ServicesOf,
	createQueryClient,
} from "./index.ts";
import { fromLayer } from "./effect.ts";

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
		const qc = createQueryClient({ isServer: true });

		expectTypeOf(qc.prefetch(postQuery, { slug: "a" })).toEqualTypeOf<
			QueryHandle<typeof postQuery>
		>();
		expectTypeOf(qc.prefetch(postQuery, { slug: "a" }).input).toEqualTypeOf<{
			slug: string;
		}>();
		expectTypeOf(qc.fetch(postQuery, { slug: "a" })).resolves.toEqualTypeOf<{
			slug: string;
			title: string;
		}>();
		expectTypeOf<DataOf<typeof commentsQuery>>().toEqualTypeOf<
			InfiniteData<{ next: number | null }, number>
		>();
		expectTypeOf(qc.prefetch(meQuery).input).toEqualTypeOf<undefined>();
	});

	it("reject wrong inputs and paging options on plain factories", () => {
		const qc = createQueryClient({ isServer: true });
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

	it("infer a queryFn Effect's services and error", () => {
		expectTypeOf<ServicesOf<typeof userQuery>>().toEqualTypeOf<Api>();
		expectTypeOf<ErrorOf<typeof userQuery>>().toEqualTypeOf<NotFound>();
		expectTypeOf<DataOf<typeof userQuery>>().toEqualTypeOf<string>();
		expectTypeOf<ServicesOf<typeof postQuery>>().toEqualTypeOf<never>();
	});

	it("take only factories whose services the client's layer provides", () => {
		const qc = createQueryClient({
			isServer: true,
			services: fromLayer(apiLayer),
		});
		const plain = createQueryClient({ isServer: true });
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

	it("accept a client of any services where any client goes", () => {
		const qc = createQueryClient({
			isServer: true,
			services: fromLayer(apiLayer),
		});
		expectTypeOf(qc).toExtend<
			ComponentProps<typeof QueryClientProvider>["client"]
		>();
		expectTypeOf(qc).toExtend<Parameters<typeof dehydrate>[0]>();
	});
});
