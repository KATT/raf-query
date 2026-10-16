"use client";

import type { LoaderVerb } from "@examples/db/types";

const hints = {
	ensure:
		"Waits for data the cache doesn't have. Cached data shows at once, even when stale, and refetches behind it.",
	fetch:
		"Waits for fresh data: on a cache miss, and when the cached data is stale.",
	prefetch:
		"Never waits: pages open at once, and each part shows a skeleton until its data lands.",
} satisfies Record<LoaderVerb, string>;

/** What the loader verb in the URL does, under the top bar. */
export function LoaderVerbHint(props: { readonly verb: LoaderVerb }) {
	return (
		<p className="text-xs text-muted-foreground">
			<code className="font-mono font-medium text-foreground">
				{props.verb}
			</code>{" "}
			{hints[props.verb]}
		</p>
	);
}
