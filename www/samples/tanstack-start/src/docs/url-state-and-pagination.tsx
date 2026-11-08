import {
	group,
	type QueryHandle,
	queryOptions,
	useQuery,
	waterfallHandle,
} from "@raf-query/react";
import { type ReactNode, Suspense, use, useState } from "react";
import type { Post } from "~/api.ts";
import { postQuery } from "~/queries.ts";

declare const loaderData: { post: QueryHandle<typeof postQuery> };

declare function PostBody(props: { readonly post: Promise<Post> }): ReactNode;

declare function PostSkeleton(): ReactNode;

function PostPage() {
	// #region skeletons-for-unrelated-content
	// This loader starts the post with `prefetch`.
	const [postThenable, postState] = useQuery(postQuery, loaderData.post);

	return (
		<Suspense key={postState.hash} fallback={<PostSkeleton />}>
			<PostBody post={postThenable} />
		</Suspense>
	);
	// #endregion
}

const search = group("search");

declare function searchPosts(input: {
	q: string;
	sort: "newest" | "oldest";
}): Promise<ReadonlyArray<Post>>;

function searchQuery(input: { q: string; sort: "newest" | "oldest" }) {
	return queryOptions({
		queryKey: search(input),
		queryFn: () => searchPosts(input),
	});
}

declare function Results(props: {
	readonly dimmed: boolean;
	readonly posts: ReadonlyArray<Post>;
}): ReactNode;

// #region input-typed-before-the-url
// `props.search` is the handle the loader started from the URL's `?q=`.
function Search(props: { search: QueryHandle<typeof searchQuery> }) {
	const [q, setQ] = useState(props.search.input.q);
	const searchHandle = waterfallHandle(searchQuery, props.search, (input) => ({
		...input,
		q,
	}));
	const [resultsThenable, resultsState] = useQuery(searchQuery, searchHandle, {
		whilePending: "previous",
	});
	const results = use(resultsThenable);

	return (
		<>
			<input value={q} onChange={(event) => setQ(event.target.value)} />
			<Results posts={results} dimmed={resultsState.isPrevious} />
		</>
	);
}
// #endregion

export { PostPage, Search };
