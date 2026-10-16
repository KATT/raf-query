import { DEFAULT_LOADER_VERB, LoaderVerb } from "@examples/db/types";

/**
 * Where an app's loaders run after the first page load. `server`: every
 * navigation loads on the server with a new, empty client (React server
 * components, React Router loaders, SvelteKit server `load`s), so `ensure`
 * waits like `fetch`.
 */
export type LoaderRuntime = "browser" | "server";

const prefetchHint =
	"Never waits: pages open at once, and each part shows a skeleton until its data lands.";

const hints = {
	browser: {
		ensure:
			"Waits for data the cache doesn't have. Cached data shows at once, even when stale, and refetches behind it.",
		fetch:
			"Waits for fresh data: on a cache miss, and when the cached data is stale.",
		prefetch: prefetchHint,
	},
	server: {
		ensure:
			"Waits for data the cache doesn't have. Every navigation loads on the server with an empty cache, so here it waits like fetch every time: use fetch.",
		fetch:
			"Waits for the data. Every navigation loads on the server with an empty cache, so it waits every time.",
		prefetch: prefetchHint,
	},
} satisfies Record<LoaderRuntime, Record<LoaderVerb, string>>;

/** What a loader verb waits for, for the line under the top bar. */
export function loaderVerbHint(loaders: LoaderRuntime, verb: LoaderVerb) {
	return hints[loaders][verb];
}

/** The verb a path starts with, or the default outside `/<verb>/…`. */
export function loaderVerbOf(pathname: string): LoaderVerb {
	return (
		LoaderVerb.safeParse(pathname.split("/")[1]).data ?? DEFAULT_LOADER_VERB
	);
}

/**
 * The same page and search under another verb. Outside `/<verb>/…` it goes
 * to the list.
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
