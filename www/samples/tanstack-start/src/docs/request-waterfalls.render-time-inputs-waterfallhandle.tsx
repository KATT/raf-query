import { use } from "react";
import { useQuery, waterfallHandle } from "@raf-query/react";
import type { Post } from "~/api.ts";
import { authorQuery } from "~/queries.ts";

declare function AuthorCard(props: {
	readonly author: unknown;
}): React.ReactNode;

// #region render-time-inputs-waterfallhandle
function PostAuthor(props: { post: Post }) {
	const handle = waterfallHandle(authorQuery, { id: props.post.authorId });
	const [authorThenable] = useQuery(authorQuery, handle);
	const author = use(authorThenable);
	return <AuthorCard author={author} />;
}
// #endregion

export { PostAuthor };
