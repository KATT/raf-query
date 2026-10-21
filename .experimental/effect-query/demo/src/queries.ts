import { Effect } from "effect";
import { RpcClientError } from "effect/rpc";
import {
	Mutation,
	Query,
	QueryCache,
} from "@raf-query/experimental-effect-query";

import { DocNotFound, EmptyTitle, Forbidden, Unauthorized } from "./api.ts";
import { DocsClient } from "./client.ts";

export const docList = Query.make({
	effect: Effect.gen(function* () {
		const docs = yield* DocsClient;
		return yield* docs.ListDocs();
	}),
	errors: [Unauthorized, RpcClientError.RpcClientError],
	key: ["docs"],
	staleTime: "10 seconds",
});

export const docQuery = (id: number) =>
	Query.make({
		effect: Effect.gen(function* () {
			const docs = yield* DocsClient;
			return yield* docs.GetDoc({ id });
		}),
		errors: [
			Forbidden,
			DocNotFound,
			Unauthorized,
			RpcClientError.RpcClientError,
		],
		key: ["docs", id],
		staleTime: "10 seconds",
	});

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
