---
title: Home (Next.js)
description: Code samples on the home page, Next.js App Router
section: Project
order: 0
---

```tsx twoslash title="src/app/posts/[slug]/page.tsx"
import {
	allKeyed,
	type EnsuredQueryHandle,
	useQuery,
} from "@raf-query/react";
import { HydrationBoundary } from "@raf-query/react/rsc";
import type { ReactNode } from "react";
import {
	commentsQuery,
	type PostComment,
	postQuery,
} from "./_twoslash.ts";
declare function getQueryClient(): import("@raf-query/react").QueryClient;
declare function renderComment(comment: PostComment): ReactNode;
// ---cut---
export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await props.params;
	const qc = getQueryClient();
	// In parallel. The page waits only on a cache miss: cached data
	// shows at once, and stale data refetches in the browser.
	const data = await allKeyed({
		post: qc.ensure(postQuery, { slug }),
		comments: qc.ensure(commentsQuery, { slug }),
	});
	return (
		<HydrationBoundary client={qc}>
			<PostPage comments={data.comments} post={data.post} />
		</HydrationBoundary>
	);
}

function PostPage(props: {
	comments: EnsuredQueryHandle<typeof commentsQuery>;
	post: EnsuredQueryHandle<typeof postQuery>;
}) {
	const [post] = useQuery(postQuery, props.post);
	//     ^?
	const [comments] = useQuery(commentsQuery, props.comments);
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
