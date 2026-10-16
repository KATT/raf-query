import type { ReactNode } from "react";

import { LoaderVerbNav } from "~/components/loader-verb.tsx";
import { parseLoaderVerb } from "~/loader-verb.ts";

/**
 * `/prefetch/…`, `/ensure/…`, `/fetch/…`: the first segment picks how the
 * pages start their queries.
 */
export default async function VerbLayout(props: {
	readonly children: ReactNode;
	readonly params: Promise<{ verb: string }>;
}) {
	const verb = parseLoaderVerb((await props.params).verb);

	return (
		<>
			<LoaderVerbNav verb={verb} />
			{props.children}
		</>
	);
}
