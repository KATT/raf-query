import { Context, Data, Effect, Exit, Layer, Option } from "effect";
import { AtomRegistry } from "effect/reactivity";
import { describe, expect, test } from "vitest";

import * as QueryCache from "./cache.ts";
import { QueryClient } from "./client.ts";
import { queryOptions } from "./options.ts";

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: number }> {}

class IssueApi extends Context.Service<
	IssueApi,
	{ get(id: number): Effect.Effect<string, NotFound> }
>()("test/IssueApi") {}

function issueApi(titles: Record<number, string>) {
	return Layer.succeed(IssueApi, {
		get: (id) =>
			id in titles
				? Effect.succeed(titles[id] ?? "")
				: Effect.fail(new NotFound({ id })),
	});
}

function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.gen(function* () {
				const api = yield* IssueApi;
				return yield* api.get(input.id);
			}),
		queryKey: ["issue", input.id],
		retry: false,
	});
}

const cacheLayer = QueryCache.layer({ isServer: false }).pipe(
	Layer.provideMerge(AtomRegistry.layer),
);

describe("QueryCache", () => {
	test("requests read the services the cache was built with", async () => {
		const program = Effect.gen(function* () {
			const cache = yield* QueryCache.QueryCache;
			return yield* cache.fetch(issueQuery, { id: 1 });
		});
		const layer = QueryCache.layer({ isServer: false }).pipe(
			Layer.provideMerge(Layer.merge(AtomRegistry.layer, issueApi({ 1: "A" }))),
		);
		await expect(
			Effect.runPromise(program.pipe(Effect.provide(layer))),
		).resolves.toBe("A");
	});

	test("requests read the services of the verb that starts them", async () => {
		const program = Effect.gen(function* () {
			const cache = yield* QueryCache.QueryCache;
			const title = yield* cache
				.fetch(issueQuery, { id: 1 })
				.pipe(Effect.provide(issueApi({ 1: "From the caller" })));
			const cached = yield* cache.getData(issueQuery, { id: 1 });
			return [title, Option.getOrUndefined(cached)];
		});
		await expect(
			Effect.runPromise(program.pipe(Effect.provide(cacheLayer))),
		).resolves.toEqual(["From the caller", "From the caller"]);
	});

	test("a request fails with the queryFn's typed error", async () => {
		const program = Effect.gen(function* () {
			const cache = yield* QueryCache.QueryCache;
			return yield* Effect.flip(cache.ensure(issueQuery, { id: 404 }));
		});
		const error = await Effect.runPromise(
			program.pipe(Effect.provide(issueApi({})), Effect.provide(cacheLayer)),
		);
		expect(error).toEqual(new NotFound({ id: 404 }));
	});

	test("a queryFn that throws is a defect", async () => {
		function brokenQuery() {
			return queryOptions({
				queryFn: (): string => {
					throw new Error("bug");
				},
				queryKey: ["broken"],
			});
		}
		const program = Effect.gen(function* () {
			const cache = yield* QueryCache.QueryCache;
			return yield* Effect.exit(cache.fetch(brokenQuery));
		});
		const exit = await Effect.runPromise(
			program.pipe(Effect.provide(cacheLayer)),
		);
		expect(Exit.hasDies(exit)).toBe(true);
	});
});

describe("QueryClient services", () => {
	test("the client's layer provides the queries' services", async () => {
		const client = new QueryClient({
			isServer: false,
			layer: issueApi({ 2: "B" }),
		});
		await expect(client.fetch(issueQuery, { id: 2 })).resolves.toBe("B");
	});

	test("a factory needing services the client lacks is a type error", () => {
		const client = new QueryClient({ isServer: false });
		// @ts-expect-error: `IssueApi` isn't in the client's layer
		expect(() => client.prefetch(issueQuery, { id: 1 })).toBeDefined();
	});

	test("dispose runs the layer's finalizers", async () => {
		const released: Array<string> = [];
		const layer = Layer.effect(
			IssueApi,
			Effect.acquireRelease(
				Effect.succeed(IssueApi.of({ get: () => Effect.succeed("C") })),
				() =>
					Effect.sync(() => {
						released.push("IssueApi");
					}),
			),
		);
		const client = new QueryClient({ isServer: false, layer });
		await client.fetch(issueQuery, { id: 3 });
		await client.dispose();
		expect(released).toEqual(["IssueApi"]);
	});
});
