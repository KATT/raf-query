import { Data, Effect } from "effect";

export interface Issue {
	readonly id: number;
	readonly title: string;
}

export class IssueNotFound extends Data.TaggedError("IssueNotFound")<{
	readonly id: number;
}> {}

export const IssueRepo = {
	get(id: number): Effect.Effect<Issue, IssueNotFound> {
		return Effect.gen(function* () {
			const response = yield* Effect.promise(() => fetch(`/api/issues/${id}`));
			if (response.status === 404) return yield* new IssueNotFound({ id });
			if (!response.ok) return yield* Effect.die(`HTTP ${response.status}`);
			return (yield* Effect.promise(() => response.json())) as Issue;
		});
	},
};
