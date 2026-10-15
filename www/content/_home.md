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
		const input = { slug: args.params.slug };
		// Both requests start at once, and the route waits for both.
		return allKeyed({
			post: qc.ensure(postQuery, input),
			comments: qc.ensure(commentsQuery, input),
		});
	},
	component: PostPage,
});

function PostPage() {
	const data = Route.useLoaderData();
	const [post] = useQuery(postQuery, data.post);
	//     ^?
	const [comments] = useQuery(commentsQuery, data.comments);
	return (
		<article>
			<h1>{post.title}</h1>
			{comments.pages.flatMap((page) => page.items.map(renderComment))}
		</article>
	);
}
```
