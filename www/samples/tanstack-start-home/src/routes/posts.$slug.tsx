import { allKeyed, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { renderComment } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

// #region hero
export const Route = createFileRoute("/posts/$slug")({
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
	const [post] = useQuery(postQuery, data.post);
	//     ^?
	const [comments] = useQuery(commentsQuery, data.comments);
	//     ^?
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
