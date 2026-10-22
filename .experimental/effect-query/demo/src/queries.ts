/**
 * Each query's and mutation's errors are its Effect's: what the RPC client
 * says the procedure can fail with. Nothing here imports an error class.
 */
import { Effect } from "effect";
import {
	Mutation,
	Query,
	QueryCache,
} from "@raf-query/experimental-effect-query";

import { DocsClient } from "./client.ts";

export const docList = Query.make({
	effect: Effect.gen(function* () {
		const docs = yield* DocsClient;
		return yield* docs.ListDocs();
	}),
	key: ["docs"],
	staleTime: "10 seconds",
});

export const docQuery = (id: number) =>
	Query.make({
		effect: Effect.gen(function* () {
			const docs = yield* DocsClient;
			return yield* docs.GetDoc({ id });
		}),
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
	});
