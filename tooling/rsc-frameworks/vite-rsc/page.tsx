import {
	createQueryClient,
	ensureEntry,
	HydrationBoundary,
	load,
	prefetchEntry,
	QueryProvider,
} from "@raf-query/react";
import { Suspense } from "react";

import { Comments } from "./comments.tsx";
import { Post } from "./post.tsx";
import { commentsQuery, postQuery, queryClientConfig } from "./queries.ts";

/** The docs' Next.js page and root layout, as one server component. */
export async function Page() {
	const qc = createQueryClient(queryClientConfig);
	const [handles] = await load(qc, {
		comments: prefetchEntry(commentsQuery, { slug: "hello" }),
		post: ensureEntry(postQuery, { slug: "hello" }),
	});
	return (
		<html lang="en">
			<body>
				<QueryProvider config={queryClientConfig}>
					<HydrationBoundary client={qc}>
						<Post handle={handles.post} />
						<Suspense fallback={<p>Loading comments…</p>}>
							<Comments handle={handles.comments} />
						</Suspense>
					</HydrationBoundary>
				</QueryProvider>
			</body>
		</html>
	);
}
