import type { QueryHandle } from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { Cause, type Effect, Match } from "effect";
import { Suspense, useState } from "react";
import type {
	EmptyTitle,
	Issue,
	IssueApi,
	IssueNotFound,
	Unauthorized,
} from "~/issues.ts";
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

/** Everything the app's queries can fail with. */
type AppError = EmptyTitle | IssueNotFound | Unauthorized;

// The client comes from the QueryClientProvider above: its layer provides `IssueApi`.
export const [App, useApp] = Boundary.root<IssueApi, AppError>({
	fallback: Crashed,
	name: "App",
});

export const [Session, useSession] = Boundary.catchErrors(App, {
	fallback: SignIn,
	name: "Session",
	tags: ["Unauthorized"],
});

export const [IssueExists, useIssueExists] = Boundary.catchErrors(Session, {
	fallback: NoSuchIssue,
	name: "IssueExists",
	tags: ["IssueNotFound"],
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
	const issue = useSession(issueQuery, props.issue);
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
export function IssueTitle(props: {
	readonly issue: QueryHandle<typeof issueQuery>;
}) {
	const issue = useIssueExists(issueQuery, props.issue);
	//    ^?
	return <h1>{issue.title}</h1>;
}
// #endregion

declare function renameIssue(input: {
	readonly id: number;
	readonly title: string;
}): Effect.Effect<Issue, EmptyTitle | Unauthorized, IssueApi>;

// #region run
export function RenameForm(props: { readonly id: number }) {
	const run = Boundary.useRun(Session);
	const [message, setMessage] = useState<string>();
	return (
		<form
			action={async (formData) => {
				const renamed = await run(
					renameIssue({ id: props.id, title: String(formData.get("title")) }),
				);
				// Unauthorized went to Session: only EmptyTitle is left.
				setMessage(
					Boundary.isUnhandled(renamed) ? "A title can't be empty." : undefined,
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

declare const run: Boundary.Run<AppError, "Unauthorized", IssueApi>;
// #region run-types
const renamed = run(renameIssue({ id: 1, title: "" }));
//    ^?
// #endregion
