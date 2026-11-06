"use client";

import {
	createQueryClient,
	type QueryClient,
	type QueryClientConfig,
} from "@raf-query/core";
import { type ReactNode, useState } from "react";

import { QueryClientProvider } from "./provider.tsx";

function browserOnly(config: QueryClientConfig | undefined): QueryClient {
	const client = createQueryClient(config);
	client["~browserOnly"] = true;
	return client;
}

/**
 * The query client provider for React Server Components apps. Creates one
 * client per server render and one per browser tab. The server render
 * starts no request: client components read what `HydrationBoundary` sent,
 * and a query nothing sent renders its Suspense fallback there and loads in
 * the browser.
 *
 * Links and features are functions, which can't cross from a server
 * component, so render it from a client component when you pass `config`:
 *
 * ```tsx
 * "use client";
 * export function Providers(props: { children: ReactNode }) {
 *   return <QueryProvider config={recommended()}>{props.children}</QueryProvider>;
 * }
 * ```
 */
export function QueryProvider(props: {
	readonly children?: ReactNode;
	/** Options for the client it creates. */
	readonly config?: QueryClientConfig;
}) {
	const config = props.config;
	const [client] = useState(() => browserOnly(config));
	return (
		<QueryClientProvider client={client}>{props.children}</QueryClientProvider>
	);
}
