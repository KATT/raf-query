import { Boundary } from "@raf-query/experimental-effect-atom";
import { Context, Effect, Match } from "effect";
import { Unauthorized } from "~/issues.ts";
import {
	issueAtom,
	runtime,
	Session,
	useApp,
	useSession,
} from "./effect-atom-boundaries.tsx";

// #region unhandled
export function Title(props: { readonly id: number }) {
	const issue = useSession(issueAtom(props.id));
	// @ts-expect-error -- 2339: until IssueNotFound is ruled out, `issue` may be an Unhandled
	return <h1>{issue.title}</h1>;
}
// #endregion

// #region non-exhaustive
export function Status(props: { readonly id: number }) {
	const issue = useApp(issueAtom(props.id));
	if (Boundary.isUnhandled(issue)) {
		// @ts-expect-error -- 2345: nothing above App catches Unauthorized, so the match must
		return Match.valueTags(issue.error, {
			IssueNotFound: () => "No such issue",
		});
	}
	return issue.title;
}
// #endregion

// #region caught-above
export const [Again] = Boundary.catchErrors(Session, {
	// @ts-expect-error -- 2322: Session already catches Unauthorized
	errors: [Unauthorized],
	fallback: () => <p>Sign in again</p>,
	name: "Again",
});
// #endregion

// #region services
class Analytics extends Context.Service<
	Analytics,
	{ readonly views: Effect.Effect<number> }
>()("app/Analytics") {}

export const viewsAtom = runtime.atom(
	// @ts-expect-error -- 2769: the runtime's layer provides IssueApi, not Analytics
	Effect.flatMap(Analytics, (analytics) => analytics.views),
);
// #endregion
