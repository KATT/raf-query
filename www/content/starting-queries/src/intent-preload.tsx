import type { QueryClient } from "@raf-query/react";
import { Link } from "@tanstack/react-router";

import { postQuery } from "./queries";

declare const qc: QueryClient;
declare const slug: string;
declare const title: string;

export function PostLink() {
	// #region intent
	return (
		<Link
			onPointerEnter={() => qc.prefetch(postQuery, { slug })}
			params={{ slug }}
			to="/posts/$slug"
		>
			{title}
		</Link>
	);
	// #endregion
}
