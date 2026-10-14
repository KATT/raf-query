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

export function fetchAllTodos() {
	return request<ReadonlyArray<Todo>>("/api/todos");
}

export function fetchTodoById(id: number) {
	return request<Todo>(`/api/todos/${id}`);
}
