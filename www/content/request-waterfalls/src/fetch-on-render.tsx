import { Suspense } from "react";

type FetchedPost = { title: string };

function useSuspenseFetch(_url: string): FetchedPost {
	return { title: "Hello" };
}

function PostBody(props: { readonly post: unknown }) {
	return <p>{String(props.post)}</p>;
}

function CommentsSkeleton() {
	return <p>Loading comments…</p>;
}

function Comments(props: { readonly slug: string }) {
	return <p>{props.slug}</p>;
}

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

void Post;
