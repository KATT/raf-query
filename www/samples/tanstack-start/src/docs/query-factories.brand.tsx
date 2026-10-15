import { type QueryHandle, queryOptions, useQuery } from "@raf-query/react";

import { getPost } from "~/api.ts";

declare function getDraft(slug: string): ReturnType<typeof getPost>;

// #region brand
const post = Symbol("post");
const draft = Symbol("draft");

function postQuery(input: { slug: string }) {
	return queryOptions({
		brand: post,
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}

function draftQuery(input: { slug: string }) {
	return queryOptions({
		brand: draft,
		queryKey: ["draft", input.slug],
		queryFn: () => getDraft(input.slug),
	});
}

function DraftView(props: { handle: QueryHandle<typeof postQuery> }) {
	// @ts-expect-error -- 2769: the handle is postQuery's
	const [draftPromise] = useQuery(draftQuery, props.handle);
	// ...
}
// #endregion
