import { LoaderVerb } from "@examples/db/types";

/**
 * The same page and search under another verb. Outside `/:verb/…` it goes to
 * the list.
 */
export function withLoaderVerb(
	location: { readonly pathname: string; readonly search: string },
	verb: LoaderVerb,
) {
	const [, first = "", ...rest] = location.pathname.split("/");
	if (!LoaderVerb.safeParse(first).success) {
		return `/${verb}/issues`;
	}
	return `/${[verb, ...rest].join("/")}${location.search}`;
}
