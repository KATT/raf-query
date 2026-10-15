---
title: Home
description: Code samples on the home page
section: Project
order: 0
---

```tsx twoslash title="src/routes/posts.$slug.tsx"
import { useQuery } from "@raf-query/react";
import { createFileRoute, postQuery } from "./_twoslash.ts";
// ---cut---
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => ({
		post: await args.context.queryClient.ensure(postQuery, {
			slug: args.params.slug,
		}),
	}),
	component: PostPage,
});

function PostPage() {
	const [post] = useQuery(postQuery, Route.useLoaderData().post);
	//     ^?
	return <h1>{post.title}</h1>;
}
```
