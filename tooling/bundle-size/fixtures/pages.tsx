import {
	group,
	bindInfiniteQueryOptions,
	load,
	prefetch,
	type QueryClient,
	QueryClientProvider,
	type QueryHandle,
	useInfiniteQuery,
} from "@raf-query/react";
import { Suspense, use } from "react";
import { createRoot } from "react-dom/client";

import { getIssue, type Issue } from "./api.ts";

const infiniteQueryOptions = bindInfiniteQueryOptions();

const feed = group("feed");

const feedQuery = () =>
	infiniteQueryOptions({
		getNextPageParam: (page: ReadonlyArray<Issue>) => page.at(-1)?.id,
		initialPageParam: 1,
		queryFn: async (context): Promise<ReadonlyArray<Issue>> => [
			await getIssue(context.pageParam),
		],
		queryKey: feed(),
	});

function Feed(props: { readonly handle: QueryHandle<typeof feedQuery> }) {
	const [pagesThenable, pagesState] = useInfiniteQuery(feedQuery, props.handle);
	const pages = use(pagesThenable);
	return (
		<>
			{pages.pages.flat().map((issue) => (
				<p key={issue.id}>{issue.title}</p>
			))}
			<button
				disabled={!pagesState.hasNextPage}
				onClick={() => void pagesState.fetchNextPage()}
				type="button"
			>
				More
			</button>
		</>
	);
}

/** Load a paged query with `client` and render it in its own root. */
export async function renderPages(client: QueryClient) {
	const [handles] = await load(client, { feed: prefetch(feedQuery) });
	const root = document.createElement("section");
	document.body.append(root);
	createRoot(root).render(
		<QueryClientProvider client={client}>
			<Suspense fallback="Loading">
				<Feed handle={handles.feed} />
			</Suspense>
		</QueryClientProvider>,
	);
}
