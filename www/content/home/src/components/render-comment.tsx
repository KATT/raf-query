import type { PostComment } from "../api";

export function renderComment(comment: PostComment) {
	return (
		<li key={comment.id}>
			<strong>{comment.author}</strong>: {comment.body}
		</li>
	);
}
