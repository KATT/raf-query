import { Skeleton } from "@examples/ui/components/skeleton";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { ClientOnly, useNavigate, useSearch } from "@tanstack/react-router";
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
	const [demoPromise] = useQuery(demoQuery, props.handle);
	const id = props.handle.input.id;
	const search = useSearch({ strict: false });
	const navigate = useNavigate();
	return (
		<DemoFrame
			demo={use(demoPromise)}
			expanded={search.demo === id}
			onExpandedChange={(expanded) => {
				void navigate({
					hash: true,
					resetScroll: false,
					search: (previous) => ({
						...previous,
						demo: expanded ? id : undefined,
					}),
					to: ".",
				});
			}}
		/>
	);
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
