/**
 * Check isUnhandled before reading the data
 *
 * `DocAccess` and the boundaries above it catch `Forbidden`, `Unauthorized` and
 * `RpcClientError`. `GetDoc` can also fail with `DocNotFound`, so
 * `useDocAccess` returns `Doc | Unhandled<DocNotFound>`: reading `.title`
 * without `Boundary.isUnhandled` first doesn't type-check.
 */
import { useDocAccess } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: { readonly id: number }) => {
	const doc = useDocAccess(docQuery(props.id));
	return <h1>{doc.title}</h1>;
};
