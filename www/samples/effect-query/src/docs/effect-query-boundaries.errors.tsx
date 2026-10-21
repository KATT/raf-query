import { Boundary, Query } from "@raf-query/experimental-effect-query";
import { Effect, Match, Result } from "effect";

import { DocNotFound, Forbidden, Unauthorized } from "~/api.ts";
import { DocAccess, useDocAccess, useSession } from "~/boundaries.tsx";
import { DocsClient } from "~/client.ts";
import { docQuery } from "~/queries.ts";

// #region unhandled
export function Title(props: { id: number }) {
	const doc = useDocAccess(docQuery(props.id));
	// @ts-expect-error -- 2339: DocNotFound is left, so `doc` is a Result
	return <h1>{doc.title}</h1>;
}
// #endregion

// #region non-exhaustive
export function Heading(props: { id: number }) {
	const result = useSession(docQuery(props.id));
	if (Result.isSuccess(result)) {
		return <h1>{result.success.title}</h1>;
	}
	// @ts-expect-error -- 2345: Forbidden has no case
	return Match.valueTags(result.failure, {
		DocNotFound: () => <p>No such doc</p>,
	});
}
// #endregion

// #region already-caught
export function Page(props: { id: number }) {
	const result = useDocAccess(docQuery(props.id));
	if (Result.isSuccess(result)) {
		return <h1>{result.success.title}</h1>;
	}
	return Match.valueTags(result.failure, {
		DocNotFound: () => <p>No such doc</p>,
		// @ts-expect-error -- 2322: Session caught it, so it can't get here
		Unauthorized: () => <p>Sign in</p>,
	});
}
// #endregion

// #region catch-twice
export const [Again, useAgain] = Boundary.catchErrors(DocAccess, {
	name: "Again",
	// @ts-expect-error -- 2322: Session already catches Unauthorized
	errors: [Unauthorized],
	fallback: () => <p>Sign in again</p>,
});
// #endregion

// #region undeclared
export const draftQuery = (id: number) =>
	Query.make({
		key: ["drafts", id],
		// @ts-expect-error -- 2322: DocNotFound and RpcClientError have no schema
		effect: Effect.flatMap(DocsClient, (docs) => docs.GetDoc({ id })),
		errors: [Forbidden, Unauthorized],
	});
// #endregion

// #region everything
export const [Everything, useEverything] = Boundary.catchErrors(DocAccess, {
	name: "Everything",
	errors: [DocNotFound],
	fallback: (props) => <p>Doc {props.error.docId} is gone.</p>,
});

export function Body(props: { id: number }) {
	const doc = useEverything(docQuery(props.id));
	//    ^?
	return <p>{doc.body}</p>;
}
// #endregion
