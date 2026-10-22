import { RegistryProvider } from "@effect/atom-react";
import { Boundary } from "@raf-query/experimental-effect-atom";
import { Cause } from "effect";
import { type ReactNode, Suspense } from "react";
import { createRoot } from "react-dom/client";
// #region boundaries
import type { EmptyTitle, IssueNotFound, Unauthorized } from "~/issues.ts";

export type AppError = IssueNotFound | Unauthorized | EmptyTitle;

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

export const [App, useApp] = Boundary.root({
	errors: Boundary.errors<AppError>(),
	fallback: Crashed,
	name: "App",
});

export const [Session, useSession] = Boundary.catchErrors(App, {
	fallback: SignIn,
	name: "Session",
	tags: ["Unauthorized"],
});
// #endregion

declare function track(event: string, data: unknown): void;
declare const container: HTMLElement;

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

// #region caught
export const [TrackedApp] = Boundary.root({
	errors: Boundary.errors<AppError>(),
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
