import type { QueryHandle } from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { Context, Effect, Match } from "effect";
import { IssueApi } from "~/issues.ts";
import { issueQuery } from "~/queries.ts";

import { Session, useApp, useSession } from "./typed-error-boundaries.tsx";

declare const handle: QueryHandle<typeof issueQuery>;

// #region unhandled
function Title() {
	const issue = useSession(issueQuery, handle);
	// @ts-expect-error -- 2339: Session doesn't catch IssueNotFound, so `issue` may be an Unhandled
	return <h1>{issue.title}</h1>;
}
// #endregion

// #region exhaustive
function Heading() {
	const issue = useApp(issueQuery, handle);
	if (Boundary.isUnhandled(issue)) {
		// @ts-expect-error -- 2345: read through App, Unauthorized is left too
		const message = Match.valueTags(issue.error, {
			IssueNotFound: () => "No such issue",
		});
		return <p>{message}</p>;
	}
	return <h1>{issue.title}</h1>;
}
// #endregion

// #region caught-above
function Banner() {
	const issue = useSession(issueQuery, handle);
	if (Boundary.isUnhandled(issue)) {
		const message = Match.valueTags(issue.error, {
			IssueNotFound: () => "No such issue",
			// @ts-expect-error -- 2322: Session caught it, so it can't reach this component
			Unauthorized: () => "Sign in",
		});
		return <p>{message}</p>;
	}
	return <h1>{issue.title}</h1>;
}
// #endregion

// #region catching-twice
export const [Again] = Boundary.catchErrors(Session, {
	fallback: () => <p>Sign in again</p>,
	name: "Again",
	// @ts-expect-error -- 2322: Session already catches Unauthorized
	tags: ["Unauthorized"],
});
// #endregion

// #region typo
export const [Missing] = Boundary.catchErrors(Session, {
	fallback: () => <p>No such issue</p>,
	name: "Missing",
	// @ts-expect-error -- 2820: no error in the app is tagged IssueNotFund
	tags: ["IssueNotFund"],
});
// #endregion

class Analytics extends Context.Service<
	Analytics,
	{ readonly track: Effect.Effect<void> }
>()("app/Analytics") {}

declare const run: Boundary.Run<
	Boundary.UniverseOf<typeof Session>,
	"Unauthorized",
	IssueApi
>;
// #region run-unhandled
async function rename() {
	const renamed = await run(
		Effect.flatMap(IssueApi, (api) => api.rename({ id: 1, title: "" })),
	);
	// @ts-expect-error -- 2339: EmptyTitle is left, so `renamed` may be an Unhandled
	return renamed.title;
}
// @ts-expect-error -- 2345: the client's layer doesn't provide Analytics
void run(Effect.flatMap(Analytics, (analytics) => analytics.track));
// #endregion

export { Banner, Heading, rename, Title };
