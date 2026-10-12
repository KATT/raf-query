"use client";

import { type DehydratedState, dehydrateQuery } from "@raf-query/core";
import { Effect } from "effect";
import { useServerInsertedHTML } from "next/navigation";
import { type ReactNode, useState } from "react";

import { hydrate, QueryClient, type QueryClientConfig } from "./client.ts";
import { hydratedHashes } from "./hydrate.tsx";
import { QueryClientProvider } from "./provider.tsx";

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

/**
 * Streams entries that client components loaded during SSR (`useWaterfall`)
 * into the HTML, ahead of the markup that reads them. Entries that arrived
 * through `HydrationBoundary` are skipped: the RSC payload carries them.
 * Data must be JSON-serializable.
 */
function useServerStream(client: QueryClient) {
	const [sent] = useState(() => new Set<string>());
	useServerInsertedHTML(() => {
		const hydrated = hydratedHashes(client);
		const queries = client
			.getAll()
			.filter(
				(query) =>
					query.getStateUnsafe().hasData &&
					!sent.has(query.hash) &&
					!hydrated.has(query.hash),
			)
			.map((query) => {
				sent.add(query.hash);
				return Effect.runSync(dehydrateQuery(query));
			});
		if (queries.length === 0) {
			return null;
		}
		const json = escapeJson(JSON.stringify({ queries }));
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
		const created = new QueryClient(config);
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
