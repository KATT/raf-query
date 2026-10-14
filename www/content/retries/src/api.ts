export interface Post {
	body: string;
	slug: string;
	title: string;
}

export class HttpError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok)
		throw new HttpError(response.status, `HTTP ${response.status}`);
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/api/posts/${slug}`);
}
