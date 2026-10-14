import { use } from "react";
import { useQuery, useWaterfall } from "@raf-query/react";

import type { Post } from "./api";
import { authorQuery } from "./queries";

function AuthorCard(props: { readonly author: unknown }) {
	return <p>{String(props.author)}</p>;
}

// #region waterfall
function PostAuthor(props: { post: Post }) {
	const author = useWaterfall(authorQuery, { id: props.post.authorId });
	const [authorPromise] = useQuery(authorQuery, author);
	return <AuthorCard author={use(authorPromise)} />;
}
// #endregion

void PostAuthor;
