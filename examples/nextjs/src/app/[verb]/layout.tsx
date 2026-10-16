import type { ReactNode } from "react";

import { parseLoaderVerb } from "~/loader-verb.ts";

/**
 * `/prefetch/…`, `/ensure/…`, `/fetch/…`: the first segment picks how the
 * pages start their queries.
 */
export default async function VerbLayout(props: {
	readonly children: ReactNode;
	readonly params: Promise<{ verb: string }>;
}) {
	parseLoaderVerb((await props.params).verb);
	return props.children;
}
