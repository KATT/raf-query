import { useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import type { Post } from "../api";
import { Spinner } from "../components/spinner";
import { postQuery } from "../queries";

export const Route = createFileRoute("/preview/$slug")({
	loader: (args) => ({
		post: args.context.queryClient.prefetch(postQuery, {
			slug: args.params.slug,
		}),
	}),
	component: PreviewPage,
});

function PreviewPage() {
	const loaderData = Route.useLoaderData();
	// #region parent
	const [postPromise] = useQuery(postQuery, loaderData.post); // from `qc.prefetch`
	return (
		<Suspense fallback={<Spinner />}>
			<PostBody post={postPromise} />
		</Suspense>
	);
	// #endregion
}

function PostBody(props: { post: Promise<Post> }) {
	const post = use(props.post);
	return <p>{post.body}</p>;
}
