export interface PostsInput {
	readonly page: number;
	readonly sort: "newest" | "oldest";
}

type SearchParams = Record<string, string | Array<string> | undefined>;

function first(value: string | Array<string> | undefined) {
	return Array.isArray(value) ? value[0] : value;
}

/** The posts list's input, from the URL's search params. */
export function parsePostsInput(search: SearchParams): PostsInput {
	const page = Number(first(search.page));
	return {
		page: Number.isInteger(page) && page > 0 ? page : 1,
		sort: first(search.sort) === "oldest" ? "oldest" : "newest",
	};
}
