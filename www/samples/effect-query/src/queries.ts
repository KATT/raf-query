import {
	Mutation,
	Query,
	QueryCache,
} from "@raf-query/experimental-effect-query";
import { Effect } from "effect";

import { DocsClient } from "./client.ts";

// #region queries
export const docList = Query.make({
	key: ["docs"],
	effect: Effect.flatMap(DocsClient, (docs) => docs.ListDocs()),
});

export const docQuery = (id: number) =>
	Query.make({
		key: ["docs", id],
		effect: Effect.flatMap(DocsClient, (docs) => docs.GetDoc({ id })),
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
	});
// #endregion
