import { QueryCache, queryOptions } from "@raf-query/core";
import { Context, Effect, Layer } from "effect";

import { type Issue, IssueNotFound, IssueRepo } from "./issue-repo";

class IssueApi extends Context.Service<
	IssueApi,
	{ readonly get: (id: number) => Effect.Effect<Issue, IssueNotFound> }
>()("app/IssueApi") {}

const IssueApiLive = Layer.succeed(IssueApi, { get: IssueRepo.get });

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () =>
			Effect.gen(function* () {
				const api = yield* IssueApi;
				return yield* api.get(input.id);
			}),
	});
}

// Effect<Issue, IssueNotFound | Query.CancelledError, QueryCache | IssueApi>
const issue = QueryCache.QueryCache.use((cache) =>
	cache.fetch(issueQuery, { id: 1 }),
);

Effect.runFork(
	issue.pipe(Effect.provide(QueryCache.layer()), Effect.provide(IssueApiLive)),
);
