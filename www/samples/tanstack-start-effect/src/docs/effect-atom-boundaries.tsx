import { Boundary } from "@raf-query/experimental-effect-atom";
import { Effect, Match } from "effect";
import { Atom } from "effect/reactivity";
import { useState } from "react";
import { IssueApi, IssueApiLive } from "~/issues.ts";

import { Session, useSession } from "./effect-atom-boundaries.boundaries.tsx";

// #region atoms
export const runtime = Atom.runtime(IssueApiLive);

export const issueAtom = Atom.family((id: number) =>
	runtime.atom(
		Effect.gen(function* () {
			const api = yield* IssueApi;
			return yield* api.get(id);
		}),
	),
);

export const renameAtom = runtime.fn(
	(input: { readonly id: number; readonly title: string }) =>
		Effect.gen(function* () {
			const api = yield* IssueApi;
			return yield* api.rename(input);
		}),
);
// #endregion

// #region read
export function IssueTitle(props: { readonly id: number }) {
	const issue = useSession(issueAtom(props.id));
	//    ^?
	if (Boundary.isUnhandled(issue)) {
		return (
			<p>
				{Match.valueTags(issue.error, {
					IssueNotFound: (missing) => `No issue ${missing.id}`,
				})}
			</p>
		);
	}
	return <h1>{issue.title}</h1>;
}
// #endregion

// #region nothing-left
export const [Issues, useIssues] = Boundary.catchErrors(Session, {
	fallback: (props) => <p>Issue {props.error.id} is gone.</p>,
	name: "Issues",
	tags: ["IssueNotFound"],
});

export function IssueHeading(props: { readonly id: number }) {
	const issue = useIssues(issueAtom(props.id));
	//    ^?
	return <h1>{issue.title}</h1>;
}
// #endregion

// #region writes
export function ClearTitle(props: { readonly id: number }) {
	const rename = Boundary.useSet(Session, renameAtom);
	//    ^?
	const [problem, setProblem] = useState<string>();
	return (
		<>
			<button
				onClick={async () => {
					const renamed = await rename({ id: props.id, title: "" });
					setProblem(
						Boundary.isUnhandled(renamed)
							? Match.valueTags(renamed.error, {
									EmptyTitle: () => "A title can't be empty.",
								})
							: undefined,
					);
				}}
			>
				Clear the title
			</button>
			{problem}
		</>
	);
}
// #endregion
