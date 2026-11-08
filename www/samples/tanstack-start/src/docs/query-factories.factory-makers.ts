import { use } from "react";
import {
	createQueryClient,
	group,
	load,
	queryOptions,
	swr,
	useQuery,
} from "@raf-query/react";

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

const qc = createQueryClient();

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
