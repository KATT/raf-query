import type { QueryHandle } from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { Cause, Effect, Match, Result } from "effect";
import { Suspense, useState } from "react";
import { IssueApi, IssueNotFound, Unauthorized } from "~/issues.ts";
import { issueQuery } from "~/queries.ts";

declare function signIn(): Promise<void>;

// #region the-chain
function Crashed(props: Boundary.RootFallbackProps) {
	return (
		<div role="alert">
			<p>Something went wrong.</p>
			<pre>{Cause.pretty(props.cause)}</pre>
			<button onClick={props.retry}>Try again</button>
		</div>
	);
}

function SignIn(props: Boundary.FallbackProps<Unauthorized>) {
	return (
		<button
			onClick={async () => {
				await signIn();
				props.retry();
			}}
		>
			Sign in
		</button>
	);
}

function NoSuchIssue(props: Boundary.FallbackProps<IssueNotFound>) {
	return <p>Issue {props.error.id} doesn't exist.</p>;
}

// The client comes from the QueryClientProvider above; `IssueApi` is what its layer provides.
export const [App, useApp] = Boundary.root<IssueApi>({
	fallback: Crashed,
	name: "App",
});

export const [Session, useSession] = Boundary.catchErrors(App, {
	errors: [Unauthorized],
	fallback: SignIn,
	name: "Session",
});

export const [IssueExists, useIssueExists] = Boundary.catchErrors(Session, {
	errors: [IssueNotFound],
	fallback: NoSuchIssue,
	name: "IssueExists",
});
// #endregion

// #region mount
export function IssuePage(props: {
	readonly issue: QueryHandle<typeof issueQuery>;
}) {
	return (
		<App>
			<Session>
				<Suspense fallback={<p>Loading…</p>}>
					<Title issue={props.issue} />
				</Suspense>
			</Session>
		</App>
	);
}
// #endregion

// #region what-is-left
function Title(props: { readonly issue: QueryHandle<typeof issueQuery> }) {
	const issue = Session.useResult(issueQuery, props.issue);
	//    ^?
	return Result.match(issue, {
		onFailure: (error) =>
			Match.valueTags(error, {
				IssueNotFound: (missing) => <p>No issue {missing.id}</p>,
			}),
		onSuccess: (found) => <h1>{found.title}</h1>,
	});
}
// #endregion

// #region nothing-left
export function IssueTitle(props: {
	readonly issue: QueryHandle<typeof issueQuery>;
}) {
	const issue = useIssueExists(issueQuery, props.issue);
	//    ^?
	return <h1>{issue.title}</h1>;
}
// #endregion

const renameIssue = (input: { readonly id: number; readonly title: string }) =>
	Effect.flatMap(IssueApi, (api) => api.rename(input));

// #region run
export function RenameForm(props: { readonly id: number }) {
	const run = Session.useRun();
	const [message, setMessage] = useState<string>();
	return (
		<form
			action={async (formData) => {
				const renamed = await run.result(
					renameIssue({ id: props.id, title: String(formData.get("title")) }),
				);
				// Unauthorized went to Session: only EmptyTitle is left.
				setMessage(
					Result.match(renamed, {
						onFailure: () => "A title can't be empty.",
						onSuccess: () => undefined,
					}),
				);
			}}
		>
			<input name="title" />
			<button>Rename</button>
			{message === undefined ? null : <p role="alert">{message}</p>}
		</form>
	);
}
// #endregion

declare const run: Boundary.Run<Unauthorized, IssueApi>;
// #region run-types
const renamed = run.result(renameIssue({ id: 1, title: "" }));
//    ^?
// #endregion
