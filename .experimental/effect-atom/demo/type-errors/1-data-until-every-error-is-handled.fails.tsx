/**
 * Until every error is handled, the data can be an `Unhandled`
 *
 * `DocAccess` and the boundaries above it catch `Forbidden`, `Unauthorized` and
 * `RpcClientError`. `GetDoc` can also fail with `DocNotFound`, so
 * `useDocAccess` returns `Doc | Unhandled<DocNotFound>`, and reading `.title`
 * off it doesn't type-check until `Boundary.isUnhandled` rules the failure out.
 */
import { docAtom } from "../src/atoms.ts";
import { useDocAccess } from "../src/boundaries.tsx";

export const Title = (props: { readonly id: number }) => {
	const doc = useDocAccess(docAtom(props.id));
	return <h1>{doc.title}</h1>;
};
