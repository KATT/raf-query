---
title: Home
description: Code samples on the home page
section: Project
order: 0
---

```tsx twoslash title="src/routes/posts.$slug.tsx"
import { allKeyed, useQuery } from "@raf-query/react";
import type { ReactNode } from "react";
import {
	commentsQuery,
	createFileRoute,
	type PostComment,
	postQuery,
} from "./_twoslash.ts";
declare function renderComment(comment: PostComment): ReactNode;
// ---cut---
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
```
