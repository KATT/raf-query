"use client";

import type { LoaderVerb } from "@examples/db/types";
import {
	type LoaderRuntime,
	loaderVerbHint,
} from "@examples/kit/lib/loader-verb";

export type { LoaderRuntime } from "@examples/kit/lib/loader-verb";

/** What the loader verb in the URL does, under the top bar. */
export function LoaderVerbHint(props: {
	readonly loaders: LoaderRuntime;
	readonly verb: LoaderVerb;
}) {
	return (
		<p className="text-xs text-muted-foreground">
			<code className="font-mono font-medium text-foreground">
				{props.verb}
			</code>{" "}
			{loaderVerbHint(props.loaders, props.verb)}
		</p>
	);
}
