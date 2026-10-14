import { queryOptions } from "@raf-query/react";
import { Data, Effect } from "effect";

export interface Issue {
	readonly id: number;
	readonly title: string;
}

export class IssueNotFound extends Data.TaggedError("IssueNotFound")<{
	readonly id: number;
}> {}

const issues = new Map<number, Issue>([[1, { id: 1, title: "Flaky test" }]]);

export const IssueRepo = {
	get(id: number): Effect.Effect<Issue, IssueNotFound> {
		const issue = issues.get(id);
		return issue
			? Effect.succeed(issue)
			: Effect.fail(new IssueNotFound({ id }));
	},
};

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueRepo.get(input.id),
	});
}
