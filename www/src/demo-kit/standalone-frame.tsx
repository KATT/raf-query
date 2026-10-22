import { Skeleton } from "@examples/ui/components/skeleton";
import { FlaskConical } from "lucide-react";
import { Suspense } from "react";

import type { StandaloneDemo } from "./define.ts";

/** A standalone demo in a box, with its title and hint above it. */
export function StandaloneFrame(props: { readonly demo: StandaloneDemo }) {
	const demo = props.demo;
	return (
		<figure className="not-prose my-8 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
			<figcaption className="grid gap-1.5 border-b px-4 py-3">
				<p className="flex items-center gap-2 text-sm font-semibold">
					<FlaskConical className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
					{demo.title}
				</p>
				<p className="text-xs text-muted-foreground">{demo.hint}</p>
			</figcaption>
			<div className="p-4">
				<Suspense fallback={<Skeleton className="h-40 w-full" />}>
					<demo.Component />
				</Suspense>
			</div>
		</figure>
	);
}
