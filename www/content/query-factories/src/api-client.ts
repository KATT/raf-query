export interface Endpoint<TArgs, TData> {
	readonly args?: TArgs;
	readonly data?: TData;
	readonly name: string;
}

export function call<TArgs, TData>(
	endpoint: Endpoint<TArgs, TData>,
	args: TArgs,
): Promise<TData> {
	throw new Error(`${endpoint.name} isn't implemented`);
}

export const api = {
	posts: {
		get: { name: "posts.get" } satisfies Endpoint<
			{ slug: string },
			{ title: string }
		>,
	},
};
