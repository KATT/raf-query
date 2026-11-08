import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { searchContent } from "../../build/content.ts";
import { sections } from "../site.ts";
import { searchDocs } from "./search.ts";

const contentDir = new URL("../../content", import.meta.url).pathname;
const samplesDir = new URL("../../samples", import.meta.url).pathname;

/** The docs as the site searches them, body text included. */
const content = await Effect.runPromise(
	searchContent({ contentDir, samplesDir }, sections).pipe(
		Effect.provide(NodeServices.layer),
	),
);

const ranking = [
	// Named for the query: a page or a section by its title, plural or not.
	["handle", "reading-queries#handles"],
	["handles", "reading-queries#handles"],
	["retry", "retries"],
	["polling", "polling"],
	["factory", "query-factories"],
	["queryOptions", "query-factories"],
	["invalidation", "query-invalidation"],
	["infinite queries", "infinite-queries"],
	["server components", "react-server-components"],
	["ssr", "ssr-and-hydration"],
	["devtools", "devtools"],
	// By its slug, where the title says it differently.
	["comparison", "comparison"],
	// With a typo, in a word of four letters or more.
	["invalidaton", "query-invalidation"],
	["cancelation", "query-cancellation"],
	// A heading named for the query, camelCase or not.
	["prefetch", "starting-queries#prefetch-or-swr"],
	["staleTime", "caching#choosing-staletime"],
	["gcTime", "caching#choosing-gctime"],
	["isFetching", "background-fetching-indicators#one-query-isfetching"],
	["waterfallhandle", "request-waterfalls#render-time-inputs-waterfallhandle"],
	["aborted", "query-cancellation#when-requests-are-aborted"],
	// Only in a section's body text.
	["useSuspenseQuery", "comparison#api-map"],
	[
		"placeholder",
		"url-state-and-pagination#what-shows-while-the-new-input-loads",
	],
	["skipToken", "starting-queries#conditional-queries"],
] as const;

describe("searchDocs on the docs", () => {
	it.each(ranking)("ranks %s first as %s", (query, expected) => {
		const top = searchDocs(content.docs, content.text, query, 3).map(
			(hit) => hit.entry.id,
		);
		expect(top[0], `top 3: ${top.join(", ")}`).toBe(expected);
	});
});
