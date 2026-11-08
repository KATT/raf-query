"use client";

import { type QueryClient, QueryClientProvider } from "@raf-query/react";
import { type ReactNode, useState } from "react";

import { makeQueryClient } from "~/query-client.ts";

/**
 * The app's query client: the router's when it makes one, or one created
 * here, per server render and per browser tab.
 */
export function Providers(props: {
	readonly children: ReactNode;
	readonly client?: QueryClient;
}) {
	const [client] = useState(() => props.client ?? makeQueryClient());
	return (
		<QueryClientProvider client={client}>{props.children}</QueryClientProvider>
	);
}
