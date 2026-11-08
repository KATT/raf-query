import { Skeleton } from "@examples/ui/components/skeleton";
import { type QueryHandle, useQuery, waterfallHandle } from "@raf-query/react";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { DemoFrame } from "~/demo-kit/frame.tsx";
import { demoQuery } from "~/demos/registry.ts";

function DemoPlaceholder() {
	return (
		<div
			aria-label="Loading demo"
			className="not-prose my-8 grid gap-3 rounded-xl border bg-card p-4"
			role="status"
		>
			<Skeleton className="h-5 w-48" />
			<Skeleton className="h-40 w-full" />
			<Skeleton className="h-16 w-full" />
		</div>
	);
}

function LoadedDemo(props: { readonly handle: QueryHandle<typeof demoQuery> }) {
	// The server doesn't send demo entries (see router.tsx), so after
	// hydration the browser loads a demo's chunk when it renders.
	const [demoThenable] = useQuery(
		demoQuery,
		waterfallHandle(demoQuery, props.handle.input),
	);
	const demo = use(demoThenable);
	return <DemoFrame demo={demo} />;
}

/**
 * Demos run only in the browser: each has its own query client, timers and
 * fake server, none of which belong in prerendered HTML.
 */
export function DemoEmbed(props: {
	readonly handle: QueryHandle<typeof demoQuery> | undefined;
}) {
	const handle = props.handle;
	if (!handle) {
		return null;
	}
	return (
		<ClientOnly fallback={<DemoPlaceholder />}>
			<Suspense fallback={<DemoPlaceholder />}>
				<LoadedDemo handle={handle} />
			</Suspense>
		</ClientOnly>
	);
}
