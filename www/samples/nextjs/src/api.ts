export interface Post {
	readonly body: string;
	readonly slug: string;
	readonly title: string;
}

export interface PostComment {
	readonly author: string;
	readonly body: string;
	readonly id: string;
}

export interface CommentPage {
	readonly items: ReadonlyArray<PostComment>;
	readonly nextCursor: number | null;
}

export interface PostPage {
	readonly items: ReadonlyArray<Post>;
	/** The last page's number. */
	readonly pageCount: number;
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/api/posts/${slug}`);
}

export function listComments(input: { cursor: number; slug: string }) {
	return request<CommentPage>(
		`/api/posts/${input.slug}/comments?cursor=${input.cursor}`,
	);
}

export function listPosts(input: { page: number }) {
	return request<PostPage>(`/api/posts?page=${input.page}`);
}
