/**
 * The data hook compiles only when nothing is left
 *
 * `DocAccess` and the boundaries above it catch `Forbidden`, `Unauthorized` and
 * `RpcClientError`. `GetDoc` can also fail with `DocNotFound`, so
 * `useDocAccess` doesn't take the query, and the error names what's left.
 * `useDocAccessResult` takes it, and returns a `Result<Doc, DocNotFound>`:
 * reading `.title` off it doesn't type-check either.
 */
import { useDocAccess, useDocAccessResult } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: { readonly id: number }) => {
	const doc = useDocAccess(docQuery(props.id));
	return <h1>{doc.title}</h1>;
};

export const ResultTitle = (props: { readonly id: number }) => {
	const doc = useDocAccessResult(docQuery(props.id));
	return <h1>{doc.title}</h1>;
};
