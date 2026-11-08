import { load, type QueryClient, swr } from "@raf-query/react";
import { authorQuery, postQuery } from "~/queries.ts";

declare const qc: QueryClient;

declare const slug: string;

async function loader() {
	// #region awaiting-several-queries
	const [handles, data] = await load(qc, {
		post: swr(postQuery, { slug }),
		author: swr(authorQuery, { id: slug }),
	});
	data.author.name;
	//   ^?
	return handles;
	// #endregion
}

export { loader };
