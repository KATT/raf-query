import { load, swr } from "@raf-query/react";
import { authorQuery, postQuery } from "~/queries.ts";
import type { makeQueryClient } from "~/query-client.ts";

declare const qc: ReturnType<typeof makeQueryClient>;

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
