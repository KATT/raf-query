/**
 * The queries and the mutation. Their error types are the RPC client's: each
 * procedure's `error`, the `Session` middleware's `Unauthorized`, and the
 * transport's `RpcClientError`. No list of errors to keep in sync: the
 * boundaries hold the schemas.
 */
import { QueryCache, queryOptions } from "@raf-query/react";
import { Effect } from "effect";

import { DocsClient } from "./client.ts";

export function docListQuery() {
	return queryOptions({
		queryFn: () =>
			Effect.gen(function* () {
				const docs = yield* DocsClient;
				return yield* docs.ListDocs();
			}),
		queryKey: ["docs"],
		retry: false,
		staleTime: 10_000,
	});
}

export function docQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.gen(function* () {
				const docs = yield* DocsClient;
				return yield* docs.GetDoc({ id: input.id });
			}),
		queryKey: ["docs", input.id],
		retry: false,
		staleTime: 10_000,
	});
}

export const renameDoc = (id: number, title: string) =>
	Effect.gen(function* () {
		const docs = yield* DocsClient;
		const doc = yield* docs.RenameDoc({ id, title });
		const cache = yield* QueryCache.QueryCache;
		yield* cache.invalidate({ queryKey: ["docs"] });
		return doc;
	});
