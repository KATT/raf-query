export interface PostComment {
	readonly author: string;
	readonly body: string;
	readonly id: string;
}

export interface CommentPage {
	readonly items: ReadonlyArray<PostComment>;
	readonly nextCursor: number | null;
}

export interface MessagePage {
	readonly items: ReadonlyArray<{ readonly body: string; readonly id: string }>;
	readonly nextCursor: string | null;
	readonly previousCursor: string | null;
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as T;
}

export function listComments(input: { cursor: number; slug: string }) {
	return request<CommentPage>(
		`/api/posts/${encodeURIComponent(input.slug)}/comments?cursor=${input.cursor}`,
	);
}

export function listMessages(input: { channel: string; cursor: string }) {
	return request<MessagePage>(
		`/api/channels/${encodeURIComponent(input.channel)}/messages?cursor=${encodeURIComponent(input.cursor)}`,
	);
}
