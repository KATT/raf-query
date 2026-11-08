import { group, queryOptions } from "@raf-query/react";
import { getPost } from "~/api.ts";
import { posts } from "~/queries.ts";

declare const input: { region: string };

const maps = group("maps");

declare function getRegionShapes(input: {
	readonly region: string;
}): Promise<unknown>;

// #region structural-sharing
queryOptions({
	queryKey: maps("shapes", input.region),
	queryFn: () => getRegionShapes(input),
	structuralSharing: false,
});
// #endregion

// #region selecting-data
export function postTitleQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("title", input.slug),
		queryFn: () => getPost(input.slug),
		select: (post) => post.title,
	});
}
// #endregion
