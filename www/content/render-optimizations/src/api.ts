export interface Post {
	body: string;
	slug: string;
	title: string;
}

export interface Todo {
	done: boolean;
	id: number;
	title: string;
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/api/posts/${slug}`);
}

/* oxlint-disable anti-slop/no-shape-in-symbol-names -- matches the guide's GeoJSON sample */
export function getRegionShapes(input: { region: string }) {
	return request<unknown>(`/api/geojson/${input.region}`);
}
