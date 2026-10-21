/**
 * Until every error is handled, the data is behind a `Result`
 *
 * `DocAccess` and the boundaries above it catch `Forbidden`, `Unauthorized` and
 * `RpcClientError`. `GetDoc` can also fail with `DocNotFound`, so
 * `useDocAccess` returns a `Result<Doc, DocNotFound>`, and reading `.title` off
 * it doesn't type-check.
 */
import { useDocAccess } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: { readonly id: number }) => {
	const doc = useDocAccess(docQuery(props.id));
	return <h1>{doc.title}</h1>;
};
