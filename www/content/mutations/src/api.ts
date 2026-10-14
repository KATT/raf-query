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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/api/posts/${encodeURIComponent(slug)}`);
}

export function updatePost(input: { slug: string; title: string }) {
	return request<Post>(`/api/posts/${encodeURIComponent(input.slug)}`, {
		body: JSON.stringify({ title: input.title }),
		method: "PATCH",
	});
}

export async function addTodo(text: string): Promise<void> {
	await request("/api/todos", {
		body: JSON.stringify({ text }),
		method: "POST",
	});
}

export function listTodos() {
	return request<ReadonlyArray<Todo>>("/api/todos");
}

export function toggleTodoApi(id: number) {
	return request<Todo>(`/api/todos/${id}/toggle`, { method: "POST" });
}
