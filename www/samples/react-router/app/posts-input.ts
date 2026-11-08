export interface PostsInput {
	readonly page: number;
}

/** The posts list's input, from the URL's search params. */
export function parsePostsInput(search: URLSearchParams): PostsInput {
	const page = Number(search.get("page"));
	return { page: Number.isInteger(page) && page > 0 ? page : 1 };
}
