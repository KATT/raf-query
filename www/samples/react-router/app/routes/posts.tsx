import {
	dehydrate,
	HydrationBoundary,
	load,
	prefetch,
	useQuery,
} from "@raf-query/react";
import { use } from "react";
import { Link } from "react-router";

import type { Post } from "~/api.ts";
import { parsePostsInput } from "~/posts-input.ts";
import { postsQuery } from "~/queries.ts";
import { queryClientContext } from "~/query-client.ts";

import type { Route } from "./+types/posts";

declare function PostList(props: {
	dimmed: boolean;
	posts: ReadonlyArray<Post>;
}): React.ReactNode;

// #region route
export async function loader(args: Route.LoaderArgs) {
	const { searchParams } = new URL(args.request.url);
	// `?sort=oldest&page=2` → `{ sort: "oldest", page: 2 }`
	const input = parsePostsInput(Object.fromEntries(searchParams));
	const qc = args.context.get(queryClientContext);
	const [handles] = await load(qc, {
		posts: prefetch(postsQuery, input),
	});
	return { ...handles, dehydratedState: dehydrate(qc) };
}

export default function PostsPage(props: Route.ComponentProps) {
	const { dehydratedState, posts } = props.loaderData;
	return (
		<HydrationBoundary state={dehydratedState}>
			<Posts handle={posts} />
		</HydrationBoundary>
	);
}

function Posts(props: { handle: Route.ComponentProps["loaderData"]["posts"] }) {
	const [postsThenable, postsState] = useQuery(postsQuery, props.handle, {
		whilePending: "previous",
	});
	const posts = use(postsThenable);
	const { page } = postsState.input;
	return (
		<>
			<nav aria-busy={postsState.isPrevious}>
				<Link to={`?sort=newest&page=${page}`}>Newest</Link>
				<Link to={`?sort=oldest&page=${page}`}>Oldest</Link>
			</nav>
			<PostList dimmed={postsState.isPrevious} posts={posts} />
		</>
	);
}
// #endregion route
