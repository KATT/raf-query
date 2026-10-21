import { RegistryProvider } from "@effect/atom-react";
import { Boundary } from "@raf-query/experimental-effect-atom";
import { Cause, Effect, Match } from "effect";
import { Atom } from "effect/reactivity";
import { type ReactNode, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	IssueApi,
	IssueApiLive,
	IssueNotFound,
	Unauthorized,
} from "~/issues.ts";

declare function track(event: string, data: unknown): void;
declare const container: HTMLElement;

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

// #region boundaries
function Crashed(props: Boundary.RootFallbackProps) {
	return (
		<div role="alert">
			<p>Something broke.</p>
			<pre>{Cause.pretty(props.cause)}</pre>
			<button onClick={props.retry}>Try again</button>
		</div>
	);
}

function SignIn(props: Boundary.FallbackProps<Unauthorized>) {
	return <button onClick={props.retry}>Sign in</button>;
}

export const [App, useApp] = Boundary.root({ fallback: Crashed, name: "App" });

export const [Session, useSession] = Boundary.catchErrors(App, {
	errors: [Unauthorized],
	fallback: SignIn,
	name: "Session",
});
// #endregion

// #region mount
export function Root(props: { readonly children: ReactNode }) {
	return (
		<RegistryProvider>
			<App>
				<Session>
					<Suspense fallback={<p>Loading…</p>}>{props.children}</Suspense>
				</Session>
			</App>
		</RegistryProvider>
	);
}
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
	errors: [IssueNotFound],
	fallback: (props) => <p>Issue {props.error.id} is gone.</p>,
	name: "Issues",
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

// #region caught
export const [TrackedApp] = Boundary.root({
	fallback: Crashed,
	name: "App",
	onCaught: (caught) =>
		track(`${caught.name} caught`, caught.error ?? Cause.pretty(caught.cause)),
});

createRoot(container, {
	onCaughtError: (error) => {
		const caught = Boundary.caughtBy(error);
		//    ^?
		track(
			caught === undefined ? "render error" : `${caught.name} caught`,
			error,
		);
	},
});
// #endregion
