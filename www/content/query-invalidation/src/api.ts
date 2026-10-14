export interface Post {
	readonly authorId: string;
	readonly body: string;
	readonly slug: string;
	readonly title: string;
}

export interface Todo {
	readonly done: boolean;
	readonly id: number;
	readonly title: string;
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/api/posts/${encodeURIComponent(slug)}`);
}

export function listTodos(input?: {
	readonly page?: number;
	readonly status?: "open" | "done";
}) {
	const params = new URLSearchParams();
	if (input?.page !== undefined) params.set("page", String(input.page));
	if (input?.status !== undefined) params.set("status", input.status);
	const query = params.toString();
	return request<ReadonlyArray<Todo>>(
		query ? `/api/todos?${query}` : "/api/todos",
	);
}

export async function addTodo(text: string): Promise<void> {
	const response = await fetch("/api/todos", {
		body: JSON.stringify({ text }),
		method: "POST",
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
