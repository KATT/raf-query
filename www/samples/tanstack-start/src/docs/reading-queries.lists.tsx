import {
	type QueryClient,
	type QueryHandle,
	useQueries,
	useQuery,
} from "@raf-query/react";
import { Suspense, use, type ReactNode } from "react";
import { postQuery } from "~/queries.ts";

declare const qc: QueryClient;

declare const search: { slugs: ReadonlyArray<string> };

declare const loaderData: {
	posts: ReadonlyArray<QueryHandle<typeof postQuery>>;
};

declare function RowSkeleton(): ReactNode;

function loader() {
	// #region list-loader
	// `/compare?slugs=intro,caching`: one query per slug in the URL.
	return {
		posts: search.slugs.map((slug) => qc.prefetch(postQuery, { slug })),
	};
	// #endregion
}

// #region list-rows
function PostRows() {
	return loaderData.posts.map((handle) => (
		<Suspense key={handle.input.slug} fallback={<RowSkeleton />}>
			<PostRow handle={handle} />
		</Suspense>
	));
}

function PostRow(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postPromise] = useQuery(postQuery, props.handle);
	const post = use(postPromise);
	return <li>{post.title}</li>;
}
// #endregion

// #region list-all
function WordCount() {
	const [postsPromise, postStates] = useQueries(postQuery, loaderData.posts);
	const posts = use(postsPromise);
	const words = posts.reduce(
		(sum, post) => sum + post.body.split(" ").length,
		0,
	);
	return (
		<p aria-busy={postStates.some((state) => state.isFetching)}>
			{posts.length} posts, {words} words
		</p>
	);
}
// #endregion
