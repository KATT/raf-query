import { queryOptions } from "@raf-query/core";
import { Effect } from "effect";

import { IssueApi } from "./issue-api";

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
