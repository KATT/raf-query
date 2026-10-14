---
title: Home
description: Code samples on the home page
section: Project
order: 0
---

```tsx twoslash title="src/routes/posts.$slug.tsx"
// @filename: tanstack-start/src/routes/posts.$slug.tsx
import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, use } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { PostComment } from "~/api.ts";
import { commentsQuery, postQuery } from "~/queries.ts";
declare function CommentsSkeleton(): React.ReactNode;
declare function renderComment(comment: PostComment): React.ReactNode;
// ---cut---
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		// Start everything before awaiting anything.
		const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
		const post = await qc.ensure(postQuery, { slug: args.params.slug });
		return { comments, post };
	},
	component: PostPage,
});

function PostPage() {
	const data = Route.useLoaderData();
	const [post] = useQuery(postQuery, data.post); // ensured: the data itself
	return (
		<article>
			<h1>{post.title}</h1>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={data.comments} />
			</Suspense>
		</article>
	);
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pages] = useQuery(commentsQuery, props.handle);
	return use(pages)
		.pages.flatMap((page) => page.items)
		.map(renderComment);
}
```
