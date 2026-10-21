import { Effect } from "effect";
import { Query, QueryCache } from "@raf-query/experimental-effect-query";

import { DocsClient } from "./client.ts";

/** Fails with `Unauthorized | RpcClientError`. */
export const docList = Query.make({
	effect: Effect.gen(function* () {
		const docs = yield* DocsClient;
		return yield* docs.ListDocs();
	}),
	key: ["docs"],
	staleTime: "10 seconds",
});

/** Fails with `Forbidden | DocNotFound | Unauthorized | RpcClientError`. */
export const docQuery = (id: number) =>
	Query.make({
		effect: Effect.gen(function* () {
			const docs = yield* DocsClient;
			return yield* docs.GetDoc({ id });
		}),
		key: ["docs", id],
		staleTime: "10 seconds",
	});

/** Fails with `Forbidden | DocNotFound | EmptyTitle | Unauthorized | RpcClientError`. */
export const renameDoc = (id: number, title: string) =>
	Effect.gen(function* () {
		const docs = yield* DocsClient;
		const doc = yield* docs.RenameDoc({ id, title });
		yield* QueryCache.invalidate(["docs"]);
		return doc;
	});
