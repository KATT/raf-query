import { use } from "react";
import { group, load, swr, useQuery } from "@raf-query/react";
import { queryOptions } from "~/raf.ts";
import { makeQueryClient } from "~/query-client.ts";

interface Endpoint<TArgs, TData> {
	readonly name: string;
}

declare function call<TArgs, TData>(
	endpoint: Endpoint<TArgs, TData>,
	args: TArgs,
): Promise<TData>;

declare const api: {
	posts: {
		get: Endpoint<{ slug: string }, { title: string }>;
	};
};

declare const slug: string;

const qc = makeQueryClient();

// #region factory-makers
function endpointQuery<TArgs, TData>(endpoint: Endpoint<TArgs, TData>) {
	const own = group(endpoint.name);
	return (args: TArgs) =>
		queryOptions({
			queryKey: own(args),
			queryFn: (): Promise<TData> => call(endpoint, args),
		});
}

const getPostQuery = endpointQuery(api.posts.get);

const [handles] = await load(qc, {
	post: swr(getPostQuery, { slug }),
});
const [postThenable] = useQuery(getPostQuery, handles.post);
const post = use(postThenable);
// #endregion
