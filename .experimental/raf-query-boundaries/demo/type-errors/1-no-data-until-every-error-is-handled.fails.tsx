/**
 * No plain data until every error is handled
 *
 * `DocAccess` and the boundaries above it catch `Forbidden`, `Unauthorized` and
 * `RpcClientError`. `GetDoc` can also fail with `DocNotFound`, so the read is
 * `Doc | Unhandled<DocNotFound>`: there's no `title` to read until
 * `Boundary.isUnhandled` has ruled the failure out.
 */
import type { QueryHandle } from "@raf-query/react";

import { useDocAccess } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: {
	readonly doc: QueryHandle<typeof docQuery>;
}) => {
	const doc = useDocAccess(docQuery, props.doc);
	return <h1>{doc.title}</h1>;
};
