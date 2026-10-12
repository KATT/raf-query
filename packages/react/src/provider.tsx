"use client";

import type { QueryClient } from "@raf-query/core";
import { createContext, type ReactNode, use, useEffect } from "react";

const QueryClientContext = createContext<QueryClient | null>(null);

/**
 * Provides a client to the tree, and refetches its read, stale queries on
 * window focus and reconnect while mounted.
 */
export function QueryClientProvider(props: {
	readonly children?: ReactNode;
	readonly client: QueryClient;
}) {
	const client = props.client;
	useEffect(() => client.mount(), [client]);
	return (
		<QueryClientContext value={client}>{props.children}</QueryClientContext>
	);
}

/** The client from the nearest {@link QueryClientProvider}. */
export function useQueryClient(): QueryClient {
	const client = use(QueryClientContext);
	if (!client) {
		throw new Error(
			"useQueryClient: no QueryClientProvider above this component",
		);
	}
	return client;
}
