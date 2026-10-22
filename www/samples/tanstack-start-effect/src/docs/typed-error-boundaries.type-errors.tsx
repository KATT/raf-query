import type { QueryHandle } from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { Context, Effect, Match, Result } from "effect";
import { IssueApi, Unauthorized } from "~/issues.ts";
import { issueQuery } from "~/queries.ts";

import { App, Session, useSession } from "./typed-error-boundaries.tsx";

declare const handle: QueryHandle<typeof issueQuery>;

// #region unhandled
function Title() {
	// @ts-expect-error -- 2345: Session doesn't catch IssueNotFound, so the read could fail
	const issue = useSession(issueQuery, handle);
	return <h1>{issue.title}</h1>;
}
// #endregion

// #region exhaustive
function Heading() {
	const issue = App.useResult(issueQuery, handle);
	return Result.match(issue, {
		onFailure: (error) =>
			// @ts-expect-error -- 2345: read through App, Unauthorized is left too
			Match.valueTags(error, {
				IssueNotFound: () => <p>No such issue</p>,
			}),
		onSuccess: (found) => <h1>{found.title}</h1>,
	});
}
// #endregion

// #region caught-above
function Banner() {
	const issue = Session.useResult(issueQuery, handle);
	return Result.match(issue, {
		onFailure: (error) =>
			Match.valueTags(error, {
				IssueNotFound: () => <p>No such issue</p>,
				// @ts-expect-error -- 2322: Session caught it, so it can't reach this component
				Unauthorized: () => <p>Sign in</p>,
			}),
		onSuccess: (found) => <h1>{found.title}</h1>,
	});
}
// #endregion

// #region catching-twice
export const [Again] = Boundary.catchErrors(Session, {
	// @ts-expect-error -- 2322: Session already catches Unauthorized
	errors: [Unauthorized],
	fallback: () => <p>Sign in again</p>,
	name: "Again",
});
// #endregion

class Analytics extends Context.Service<
	Analytics,
	{ readonly track: Effect.Effect<void> }
>()("app/Analytics") {}

declare const run: Boundary.Run<Unauthorized, IssueApi>;
// #region run-unhandled
// @ts-expect-error -- 2345: EmptyTitle is left: use run.result
run(Effect.flatMap(IssueApi, (api) => api.rename({ id: 1, title: "" })));
// @ts-expect-error -- 2345: the client's layer doesn't provide Analytics
run(Effect.flatMap(Analytics, (analytics) => analytics.track));
// #endregion

export { Banner, Heading, Title };
