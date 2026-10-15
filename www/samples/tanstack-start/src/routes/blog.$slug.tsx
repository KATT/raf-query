import { allKeyed, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { use } from "react";

import { renderComment } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

// The homepage's hero: the post page waiting for both queries.
// `posts.$slug.tsx` is the same page streaming the comments.

// #region hero
export const Route = createFileRoute("/blog/$slug")({
	loader: (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		// In parallel. The route waits only on a cache miss: cached data
		// shows at once, and stale data refetches in the background.
		return allKeyed({
			post: qc.ensure(postQuery, { slug }),
			comments: qc.ensure(commentsQuery, { slug }),
		});
	},
	component: PostPage,
});

function PostPage() {
	const data = Route.useLoaderData();
	const [postPromise] = useQuery(postQuery, data.post);
	const [commentsPromise] = useQuery(commentsQuery, data.comments);
	// Both were ensured, so use() returns without suspending.
	const post = use(postPromise);
	//    ^?
	const comments = use(commentsPromise);
	//    ^?
	// ---collapse---
	return (
		<article>
			<h1>{post.title}</h1>
			{comments.pages.flatMap((page) => page.items.map(renderComment))}
		</article>
	);
	// ---/collapse---
}
// #endregion hero
