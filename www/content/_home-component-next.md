---
title: Home, step 3 (Next.js)
description: The homepage's client components, Next.js App Router
section: Project
order: 0
---

```tsx twoslash title="src/components/post-page.tsx"
import {
	type EnsuredQueryHandle,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";
import { Suspense, use } from "react";
import {
	commentsQuery,
	type PostComment,
	postQuery,
} from "./_twoslash.ts";
declare function CommentsSkeleton(): React.ReactNode;
declare function renderComment(comment: PostComment): React.ReactNode;
// ---cut---
("use client");

export function PostPage(props: {
	comments: QueryHandle<typeof commentsQuery>;
	post: EnsuredQueryHandle<typeof postQuery>;
}) {
	// ensure put the post in the cache, so this is the post itself.
	const [post] = useQuery(postQuery, props.post);
	//     ^?
	return (
		<article>
			<h1>{post.title}</h1>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={props.comments} />
			</Suspense>
		</article>
	);
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pages] = useQuery(commentsQuery, props.handle);
	//     ^?
	return use(pages)
		.pages.flatMap((page) => page.items)
		.map(renderComment);
}
```
