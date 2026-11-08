export interface Post {
	readonly authorId: string;
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
	readonly nextCursor: number | null;
}

export interface Author {
	readonly id: string;
	readonly name: string;
}

export interface User {
	readonly id: string;
	readonly name: string;
}

export class HttpError extends Error {
	constructor(readonly status: number) {
		super(`HTTP ${status}`);
	}
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) throw new HttpError(response.status);
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

export function addComment(input: { body: string; slug: string }) {
	return request<PostComment>(`/api/posts/${input.slug}/comments`, {
		method: "POST",
		body: JSON.stringify({ body: input.body }),
	});
}

export function listPosts(input: { page: number; sort: "newest" | "oldest" }) {
	return request<ReadonlyArray<Post>>(
		`/api/posts?page=${input.page}&sort=${input.sort}`,
	);
}

export function updatePost(input: { slug: string; title: string }) {
	return request<Post>(`/api/posts/${input.slug}`, {
		method: "PATCH",
		body: JSON.stringify(input),
	});
}

export function listPostPage(input: {
	authorId?: string;
	cursor: number;
	drafts?: boolean;
}) {
	const search = new URLSearchParams({ cursor: String(input.cursor) });
	if (input.authorId) search.set("authorId", input.authorId);
	if (input.drafts) search.set("drafts", "true");
	return request<PostPage>(`/api/posts?${search}`);
}

export function getAuthor(id: string) {
	return request<Author>(`/api/authors/${id}`);
}

/** The post's author, looked up by the server from the post's slug. */
export function getPostAuthor(slug: string) {
	return request<Author>(`/api/posts/${slug}/author`);
}

export function getPostViews(slug: string) {
	return request<number>(`/api/posts/${slug}/views`);
}

export function getCommentCount(slug: string) {
	return request<number>(`/api/posts/${slug}/comments/count`);
}

/** `null` when signed out. */
export function getMe() {
	return request<User | null>("/api/me");
}
