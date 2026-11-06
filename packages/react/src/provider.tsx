"use client";

import { createContext, type ReactNode, use, useEffect } from "react";

import type { QueryClient } from "@raf-query/core";
import { mount } from "@raf-query/core/internal";

const QueryClientContext = createContext<QueryClient | null>(null);

/**
 * Provides a client to the tree, and runs its features (focus and
 * reconnect refetching, polling, …) while mounted.
 */
export function QueryClientProvider(props: {
	readonly children?: ReactNode;
	readonly client: QueryClient;
}) {
	const client = props.client;
	useEffect(() => mount(client), [client]);
	return (
		<QueryClientContext value={client}>{props.children}</QueryClientContext>
	);
}

/** The nearest provider's client, or `null` outside one. */
export function useOptionalQueryClient(): QueryClient | null {
	return use(QueryClientContext);
}

/** The client from the nearest {@link QueryClientProvider}. */
export function useQueryClient(): QueryClient {
	const client = useOptionalQueryClient();
	if (!client) {
		throw new Error(
			"useQueryClient: no QueryClientProvider above this component",
		);
	}
	return client;
}
