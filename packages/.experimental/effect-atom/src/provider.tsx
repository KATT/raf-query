"use client";

import { createContext, type ReactNode, use } from "react";

import type { QueryClient } from "./client.ts";

const QueryClientContext = createContext<QueryClient<unknown> | null>(null);

/**
 * Provides a client to the tree. Focus and reconnect refetches need no
 * mount: each read query's atom listens while it's read.
 */
export function QueryClientProvider(props: {
	readonly children?: ReactNode;
	readonly client: QueryClient<unknown>;
}) {
	return (
		<QueryClientContext value={props.client}>
			{props.children}
		</QueryClientContext>
	);
}

/** The client from the nearest {@link QueryClientProvider}. */
export function useQueryClient(): QueryClient<unknown> {
	const client = use(QueryClientContext);
	if (!client) {
		throw new Error(
			"useQueryClient: no QueryClientProvider above this component",
		);
	}
	return client;
}
