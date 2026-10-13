"use client";

import { type DehydratedState, Query } from "@raf-query/core";
import { useServerInsertedHTML } from "next/navigation";
import { type ReactNode, useState } from "react";

import {
	dehydrate,
	hydrate,
	QueryClient,
	type QueryClientConfig,
	createQueryClient,
} from "./client.ts";
import { QueryClientProvider } from "./provider.tsx";
import { sentHashes } from "./sent.ts";

declare global {
	/** Entries streamed by `QueryProvider` during SSR, until the browser client takes over. */
	var RAF_QUERY_SSR: { push(state: DehydratedState): void } | undefined;
}

function escapeJson(json: string) {
	return json
		.replaceAll("<", String.raw`\u003c`)
		.replaceAll("\u2028", String.raw`\u2028`)
		.replaceAll("\u2029", String.raw`\u2029`);
}

/** Hydrate what SSR streamed so far, then hydrate every later chunk on arrival. */
function receiveStream(client: QueryClient) {
	const queued = globalThis.RAF_QUERY_SSR;
	if (Array.isArray(queued)) {
		for (const state of queued) {
			hydrate(client, state);
		}
	}
	globalThis.RAF_QUERY_SSR = {
		push: (state) => hydrate(client, state),
	};
}

function hasData(query: Query.Query) {
	return Query.getUnsafe(query).hasData;
}

/**
 * Streams entries that client components loaded during SSR (`useWaterfall`)
 * into the HTML, ahead of the markup that reads them. Entries that arrived
 * through `HydrationBoundary` are skipped: the RSC payload carries them.
 * Data must be JSON-serializable, so only settled entries are sent.
 */
function useServerStream(client: QueryClient) {
	useServerInsertedHTML(() => {
		const state = dehydrate(client, {
			filter: hasData,
			sent: sentHashes(client),
		});
		if (state.queries.length === 0) {
			return null;
		}
		const json = escapeJson(JSON.stringify(state));
		return (
			<script
				dangerouslySetInnerHTML={{
					__html: `(self.RAF_QUERY_SSR=self.RAF_QUERY_SSR||[]).push(${json})`,
				}}
			/>
		);
	});
}

/**
 * The query client provider for Next.js App Router. Creates one client per
 * request during SSR and one per tab in the browser.
 *
 * ```tsx
 * // app/layout.tsx
 * <QueryProvider>{props.children}</QueryProvider>
 * ```
 */
export function QueryProvider(props: {
	readonly children?: ReactNode;
	/** Options for the client it creates. */
	readonly config?: QueryClientConfig;
}) {
	const config = props.config;
	const [client] = useState(() => {
		const created = createQueryClient(config);
		if (!created.isServer) {
			receiveStream(created);
		}
		return created;
	});
	useServerStream(client);
	return (
		<QueryClientProvider client={client}>{props.children}</QueryClientProvider>
	);
}
