import { useQuery } from "@raf-query/react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { use } from "react";
import { z } from "zod";

import { PostList } from "../components/post-list";
import { postsQuery } from "../queries";

const PostsSearch = z.object({
	sort: z.enum(["newest", "oldest"]).default("newest"),
	page: z.int().positive().default(1),
});

// #region posts-page
export const Route = createFileRoute("/posts")({
	validateSearch: PostsSearch,
	loaderDeps: (args) => args.search,
	loader: (args) => ({
		posts: args.context.queryClient.prefetch(postsQuery, args.deps),
	}),
	component: PostsPage,
});

function PostsPage() {
	const loaderData = Route.useLoaderData();
	const [postsPromise, postsState] = useQuery(postsQuery, loaderData.posts, {
		whilePending: "previous",
	});

	return (
		<>
			<nav aria-busy={postsState.isPrevious}>
				<Link search={(prev) => ({ ...prev, sort: "newest" })} to=".">
					Newest
				</Link>
				<Link search={(prev) => ({ ...prev, sort: "oldest" })} to=".">
					Oldest
				</Link>
			</nav>
			<PostList dimmed={postsState.isPrevious} posts={use(postsPromise)} />
		</>
	);
}
// #endregion
