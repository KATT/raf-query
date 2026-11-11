import { load, prefetch } from "@raf-query/react";
import { Link } from "@tanstack/react-router";
import { postQuery } from "~/queries.ts";
import type { makeQueryClient } from "~/query-client.ts";

declare const qc: ReturnType<typeof makeQueryClient>;

declare const slug: string;

declare const title: string;

// #region preloading-on-intent
<Link
	to="/posts/$slug"
	params={{ slug }}
	onPointerEnter={() => {
		void load(qc, { post: prefetch(postQuery, { slug }) });
	}}
>
	{title}
</Link>;
// #endregion
