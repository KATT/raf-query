import { Suspense } from "react";
import { load, prefetch, revalidate } from "@raf-query/react";
import { authorQuery, postQuery } from "~/queries.ts";
import { makeQueryClient } from "~/query-client.ts";

declare function useSuspenseFetch(url: string): { title: string };

declare function PostBody(props: { readonly post: unknown }): React.ReactNode;

declare function CommentsSkeleton(): React.ReactNode;

declare function Comments(props: { readonly slug: string }): React.ReactNode;

// #region fetch-on-render
function Post(props: { slug: string }) {
	// Fetched during render: nothing below starts until this resolves.
	const post = useSuspenseFetch(`/posts/${props.slug}`);
	return (
		<>
			<PostBody post={post} />
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments slug={props.slug} />
			</Suspense>
		</>
	);
}
// #endregion

const qc = makeQueryClient();

declare const slug: string;

// #region fetch-then-prefetch
const [postHandles, data] = await load(qc, {
	post: revalidate(postQuery, { slug }),
});
const [authorHandles] = await load(qc, {
	author: prefetch(authorQuery, { id: data.post.authorId }),
});
// #endregion
