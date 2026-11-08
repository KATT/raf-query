export interface PostListFilter {
	readonly page: number;
}

export interface PostListParser {
	parse(value: Record<string, string | Array<string>>): PostListFilter;
}

export const PostListInput: PostListParser = {
	parse(value) {
		const raw = value.page;
		const page = Number(Array.isArray(raw) ? raw[0] : raw);
		return { page: Number.isInteger(page) && page > 0 ? page : 1 };
	},
};
