import { queryOptions } from "@raf-query/react";
import { Schedule } from "effect";

import { IssueRepo } from "./issue-repo";

// #region effect-query-fn
export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueRepo.get(input.id), // Effect<Issue, IssueNotFound>
		retry: Schedule.exponential("200 millis").pipe(Schedule.upTo({ times: 3 })),
	});
}
// #endregion
