export interface Post {
	authorId: string;
	body: string;
	slug: string;
	title: string;
}

export interface Todo {
	done: boolean;
	id: number;
	title: string;
}

export function getPost(slug: string) {
	return fetch(`/api/posts/${slug}`).then((response) =>
		response.json(),
	) as Promise<Post>;
}

export function listTodos() {
	return fetch("/api/todos").then((response) => response.json()) as Promise<
		ReadonlyArray<Todo>
	>;
}
