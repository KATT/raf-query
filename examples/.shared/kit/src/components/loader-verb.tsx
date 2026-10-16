"use client";

import type { LoaderVerb } from "@examples/db/types";
import { cn } from "@examples/ui/lib/utils";
import type { ReactNode } from "react";

const hints = {
	ensure:
		"Waits for data the cache doesn't have. Cached data shows at once, even when stale, and refetches behind it.",
	fetch:
		"Waits for fresh data: on a cache miss, and when the cached data is stale.",
	prefetch:
		"Never waits: pages open at once, and each part shows a skeleton until its data lands.",
} satisfies Record<LoaderVerb, string>;

/** The class for each verb's link; the app renders the links with its router. */
export function loaderVerbLinkClassName(active: boolean) {
	return cn(
		"rounded-md px-2.5 py-1 font-mono text-xs hover:bg-muted",
		active && "bg-muted font-semibold",
	);
}

/**
 * The bar above each page that picks how its loader starts queries.
 * `children` are one link per verb, to the same page under that verb.
 */
export function LoaderVerbBar(props: {
	readonly children: ReactNode;
	readonly verb: LoaderVerb;
}) {
	return (
		<div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
			<nav aria-label="Loader verb" className="flex items-center gap-1">
				<span className="mr-1 text-muted-foreground">Loader</span>
				{props.children}
			</nav>
			<p className="text-muted-foreground">{hints[props.verb]}</p>
		</div>
	);
}
