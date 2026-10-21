import {
	Mutation,
	Query,
	QueryCache,
} from "@raf-query/experimental-effect-query";
import { Effect } from "effect";
import { RpcClientError } from "effect/rpc";

import { DocNotFound, EmptyTitle, Forbidden, Unauthorized } from "./api.ts";
import { DocsClient } from "./client.ts";

// #region queries
export const docList = Query.make({
	key: ["docs"],
	effect: Effect.flatMap(DocsClient, (docs) => docs.ListDocs()),
	errors: [Unauthorized, RpcClientError.RpcClientError],
});

export const docQuery = (id: number) =>
	Query.make({
		key: ["docs", id],
		effect: Effect.flatMap(DocsClient, (docs) => docs.GetDoc({ id })),
		errors: [
			Forbidden,
			DocNotFound,
			Unauthorized,
			RpcClientError.RpcClientError,
		],
		staleTime: "10 seconds",
	});
// #endregion

// #region mutation
export const renameDoc = (id: number, title: string) =>
	Mutation.make({
		effect: Effect.gen(function* () {
			const docs = yield* DocsClient;
			const doc = yield* docs.RenameDoc({ id, title });
			yield* QueryCache.invalidate(["docs"]);
			return doc;
		}),
		errors: [
			Forbidden,
			DocNotFound,
			EmptyTitle,
			Unauthorized,
			RpcClientError.RpcClientError,
		],
	});
// #endregion
