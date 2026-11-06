import {
	createQueryClient,
	ensureEntry,
	load,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { group } from "@raf-query/react/groups";

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
	post: ensureEntry(getPostQuery, { slug }),
});
const [post] = useQuery(getPostQuery, handles.post);
// #endregion
