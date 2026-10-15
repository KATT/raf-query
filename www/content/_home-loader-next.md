---
title: Home, step 2 (Next.js)
description: The homepage's server component, Next.js App Router
section: Project
order: 0
---

```tsx twoslash title="src/app/posts/[slug]/page.tsx"
import { HydrationBoundary } from "@raf-query/react/rsc";
import { commentsQuery, postQuery } from "./_twoslash.ts";
declare function getQueryClient(): import("@raf-query/react").QueryClient;
declare function PostPage(props: {
	comments: import("@raf-query/react").QueryHandle<typeof commentsQuery>;
	post: import("@raf-query/react").EnsuredQueryHandle<typeof postQuery>;
}): null;
// ---cut---
export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await props.params;
	const qc = getQueryClient();
	// Never waits: the comments load while the page streams.
	const comments = qc.prefetch(commentsQuery, { slug });
	// Waits only if the post isn't in the cache yet.
	const post = await qc.ensure(postQuery, { slug });
	return (
		<HydrationBoundary client={qc}>
			<PostPage comments={comments} post={post} />
		</HydrationBoundary>
	);
}
```
