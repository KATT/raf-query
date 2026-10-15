"use client";

import type { DehydratedState, HydrateOptions } from "@raf-query/core";
import type { ReactNode } from "react";

import { Hydrate } from "./hydrate.tsx";

/**
 * Writes a loader's dehydrated cache into the browser (or SSR) client.
 * Use it with React Router Framework Mode: start queries in the loader,
 * `dehydrate` the request's client, and pass that state here.
 *
 * ```tsx
 * export async function loader(args: Route.LoaderArgs) {
 *   const qc = new QueryClient();
 *   const post = await qc.ensure(postQuery, { slug: args.params.slug });
 *   return { dehydratedState: dehydrate(qc), post };
 * }
 *
 * export default function Page(props: Route.ComponentProps) {
 *   const { dehydratedState, post } = props.loaderData;
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <Post handle={post} />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 *
 * Pending entries cross as promises when the framework's serializer
 * supports them (React Router's Single Fetch does). Nested boundaries
 * are fine: each only writes what its `state` holds.
 */
export function HydrationBoundary(props: {
	readonly children?: ReactNode;
	readonly options?: HydrateOptions;
	readonly state: DehydratedState;
}) {
	return (
		<Hydrate options={props.options} state={props.state}>
			{props.children}
		</Hydrate>
	);
}
