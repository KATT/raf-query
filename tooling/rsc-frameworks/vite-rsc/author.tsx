"use client";

import { use } from "react";
import { useQuery, waterfallHandle } from "@raf-query/react";

import { authorQuery } from "./queries.ts";

/** A query no server component started: it loads in the browser. */
export function Author(props: { slug: string }) {
	const [authorThenable] = useQuery(
		authorQuery,
		waterfallHandle(authorQuery, { slug: props.slug }),
	);
	const author = use(authorThenable);
	return <p>By {author.name}</p>;
}
