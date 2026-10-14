import { queryOptions } from "@raf-query/react";
import { Context, Effect, Layer } from "effect";

import { type Issue, type IssueNotFound, IssueRepo } from "./issues.ts";

export class IssueApi extends Context.Service<
	IssueApi,
	{ readonly get: (id: number) => Effect.Effect<Issue, IssueNotFound> }
>()("app/IssueApi") {}

export const IssueApiLive = Layer.succeed(IssueApi, { get: IssueRepo.get });

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
