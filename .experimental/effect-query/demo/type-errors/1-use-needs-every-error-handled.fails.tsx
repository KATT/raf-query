/**
 * `use` only compiles when every error is handled
 *
 * `DocAccess` and the boundaries above it catch `Forbidden`, `Unauthorized` and
 * `RpcClientError`. `GetDoc` can also fail with `DocNotFound`, so `use`, which
 * returns the data and nothing else, doesn't type-check, and says which tag is
 * left.
 */
import { DocAccess } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: { readonly id: number }) => {
	const doc = DocAccess.use(docQuery(props.id));
	return <h1>{doc.title}</h1>;
};
