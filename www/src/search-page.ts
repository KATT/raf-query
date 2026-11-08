import { z } from "zod";

/** Search results at their own URL, `/search?q=`. */
export const searchPage = {
	description: "Search raf-query's docs: every page and section.",
	path: "/search",
	title: "Search",
} as const;

const queryText = z
	.union([z.string(), z.number(), z.boolean()])
	.transform(String)
	.pipe(z.string().min(1));

/**
 * `?q=`, the query, on any page: on `/search` it's what the page lists, and
 * anywhere else it opens the search dialog on it, so a search is a link. The
 * router parses `?q=404` as a number; it's still what was searched for. An
 * empty one is none.
 */
export const querySearchSchema = z.object({
	q: z
		.unknown()
		.transform((value) => {
			const parsed = queryText.safeParse(value);
			return parsed.success ? parsed.data : undefined;
		})
		.optional(),
});
