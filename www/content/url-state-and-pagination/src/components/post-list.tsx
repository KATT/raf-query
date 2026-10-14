import type { Post } from "../api";

export function PostList(props: {
	dimmed: boolean;
	posts: ReadonlyArray<Post>;
}) {
	return (
		<ul aria-hidden={props.dimmed}>
			{props.posts.map((post) => (
				<li key={post.slug}>{post.title}</li>
			))}
		</ul>
	);
}
