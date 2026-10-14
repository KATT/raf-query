// #region program
import { QueryCache } from "@raf-query/core";
import { Effect, Stream } from "effect";

import { issueQuery } from "./queries";

const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	yield* cache.fetch(issueQuery, { id: 1 });
	yield* cache.watch(issueQuery, { id: 1 }).pipe(
		Stream.map((state) => state.data?.title),
		Stream.runForEach((title) => Effect.log(title)),
	);
});

Effect.runFork(program.pipe(Effect.provide(QueryCache.layer())));
// #endregion
