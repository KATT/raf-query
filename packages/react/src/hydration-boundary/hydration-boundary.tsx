"use client";

import type {
	DehydratedState,
	DehydrateOptions,
	QueryClient,
} from "@raf-query/core";
import type { ReactNode } from "react";

import { Hydrate } from "./hydrate.tsx";

export type HydrationBoundaryProps =
	| {
			readonly children?: ReactNode;
			/**
			 * The request's server client (e.g. from React's `cache()`). Server
			 * components only.
			 */
			readonly client: QueryClient;
			readonly options?: DehydrateOptions;
			readonly state?: never;
	  }
	| {
			readonly children?: ReactNode;
			readonly client?: never;
			readonly options?: never;
			/** A loader's `dehydrate(client)`. */
			readonly state: DehydratedState;
	  };

/**
 * Writes server data into the browser (or SSR) client.
 *
 * In a server component, pass the request's `client`. Its entries go
 * through the RSC payload: pending entries cross as promises and stream in
 * as they settle, and entries an earlier boundary already sent in this
 * request are skipped. Server components get that build of the component
 * through the package's `react-server` export condition.
 *
 * ```tsx
 * const client = getQueryClient();
 * const [handles] = await load(client, { comments: prefetch(commentsQuery, { slug }) });
 * return (
 *   <HydrationBoundary client={client}>
 *     <Comments handle={handles.comments} />
 *   </HydrationBoundary>
 * );
 * ```
 *
 * With loaders, such as React Router Framework Mode, pass the `state` the
 * loader dehydrated. Pending entries cross as promises when the framework's
 * serializer supports them (React Router's Single Fetch does).
 */
export function HydrationBoundary(props: HydrationBoundaryProps) {
	// The types allow `client` here: TypeScript can't tell which build a file
	// gets, since it doesn't see the `react-server` condition.
	if (props.state === undefined) {
		throw new Error(
			"HydrationBoundary needs `state` here. `client` works only in server components.",
		);
	}
	return <Hydrate state={props.state}>{props.children}</Hydrate>;
}
