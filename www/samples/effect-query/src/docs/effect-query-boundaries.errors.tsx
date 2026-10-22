import { Boundary } from "@raf-query/experimental-effect-query";
import { Match } from "effect";

import type { AppError } from "~/boundaries.tsx";
import { DocAccess, Session, useDocAccess, useSession } from "~/boundaries.tsx";
import { client } from "~/client.ts";
import { docQuery } from "~/queries.ts";

// #region unhandled
export function Title(props: { id: number }) {
	const doc = useDocAccess(docQuery(props.id));
	// @ts-expect-error -- 2339: DocNotFound is left, so `doc` may be an Unhandled
	return <h1>{doc.title}</h1>;
}
// #endregion

// #region non-exhaustive
export function Heading(props: { id: number }) {
	const doc = useSession(docQuery(props.id));
	if (Boundary.isUnhandled(doc)) {
		// @ts-expect-error -- 2345: Forbidden has no case
		return Match.valueTags(doc.error, {
			DocNotFound: () => <p>No such doc</p>,
		});
	}
	return <h1>{doc.title}</h1>;
}
// #endregion

// #region already-caught
export function Page(props: { id: number }) {
	const doc = useDocAccess(docQuery(props.id));
	if (Boundary.isUnhandled(doc)) {
		return Match.valueTags(doc.error, {
			DocNotFound: () => <p>No such doc</p>,
			// @ts-expect-error -- 2322: Session caught it, so it can't get here
			Unauthorized: () => <p>Sign in</p>,
		});
	}
	return <h1>{doc.title}</h1>;
}
// #endregion

// #region catch-twice
export const [Again] = Boundary.catchErrors(DocAccess, {
	name: "Again",
	// @ts-expect-error -- 2322: Session already catches Unauthorized
	tags: ["Unauthorized"],
	fallback: () => <p>Sign in again</p>,
});
// #endregion

// #region typo
export const [Access] = Boundary.catchErrors(Session, {
	name: "Access",
	// @ts-expect-error -- 2820: not a tag of the root's errors
	tags: ["Forbiden"],
	fallback: () => <p>No access</p>,
});
// #endregion

// #region shared-tag
interface OrgForbidden {
	readonly _tag: "Forbidden";
	readonly orgId: string;
}

export const [Org] = Boundary.root({
	name: "Org",
	client,
	errors: Boundary.errors<AppError | OrgForbidden>(),
	fallback: () => <p>Something broke.</p>,
});

export const [OrgAccess] = Boundary.catchErrors(Org, {
	name: "OrgAccess",
	// @ts-expect-error -- 2322: a doc's Forbidden and an org's share the tag
	tags: ["Forbidden"],
	fallback: () => <p>No access</p>,
});
// #endregion

// #region everything
export const [Everything, useEverything] = Boundary.catchErrors(DocAccess, {
	name: "Everything",
	tags: ["DocNotFound"],
	fallback: (props) => <p>Doc {props.error.docId} is gone.</p>,
});

export function Body(props: { id: number }) {
	const doc = useEverything(docQuery(props.id));
	//    ^?
	return <p>{doc.body}</p>;
}
// #endregion
