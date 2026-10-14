export interface Todo {
	id: number;
	title: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as T;
}

export function fetchTodo(id: number) {
	return request<Todo>(`/api/todos/${id}`);
}

export function createTodo(input: { title: string }) {
	return request<Todo>("/api/todos", {
		method: "POST",
		body: JSON.stringify(input),
	});
}
