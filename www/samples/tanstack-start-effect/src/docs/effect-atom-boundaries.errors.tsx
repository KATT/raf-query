import { Boundary } from "@raf-query/experimental-effect-atom";
import { Context, Effect, Match } from "effect";
import { Atom } from "effect/reactivity";

import {
	type AppError,
	App,
	Session,
	useApp,
	useSession,
} from "./effect-atom-boundaries.boundaries.tsx";
import { issueAtom, runtime } from "./effect-atom-boundaries.tsx";

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
	fallback: () => <p>Sign in again</p>,
	name: "Again",
	// @ts-expect-error -- 2322: Session already catches Unauthorized
	tags: ["IssueNotFound", "Unauthorized"],
});
// #endregion

// #region typo
export const [Missing] = Boundary.catchErrors(Session, {
	fallback: () => <p>Not found</p>,
	name: "Missing",
	// @ts-expect-error -- 2820: a tag must be one of AppError's
	tags: ["IssueNotFond"],
});
// #endregion

// #region shared-tag
/** Another API's `Unauthorized`, about an organization. */
interface OrgUnauthorized {
	readonly _tag: "Unauthorized";
	readonly orgId: string;
}

const [Both] = Boundary.root({
	errors: Boundary.errors<AppError | OrgUnauthorized>(),
	fallback: () => <p>Crashed</p>,
	name: "Both",
});

export const [SignedOut] = Boundary.catchErrors(Both, {
	fallback: () => <p>Sign in</p>,
	name: "SignedOut",
	// @ts-expect-error -- 2322: two errors of the universe are tagged Unauthorized
	tags: ["Unauthorized"],
});
// #endregion

// #region another-type
class NotTheIssueNotFound {
	readonly _tag = "IssueNotFound";
	readonly path = "/issues/1";
}

const pageAtom = Atom.make(Effect.fail(new NotTheIssueNotFound()));

export const [Pages, usePages] = Boundary.catchErrors(App, {
	fallback: (props) => <p>Issue {props.error.id} is gone.</p>,
	name: "Pages",
	tags: ["IssueNotFound"],
});

export function Page() {
	// @ts-expect-error -- 2345: Pages's fallback expects the universe's IssueNotFound
	const page = usePages(pageAtom);
	return <p>{String(page)}</p>;
}
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
