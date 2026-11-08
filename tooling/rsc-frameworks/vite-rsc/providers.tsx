"use client";

import {
	createQueryClient,
	type QueryClient,
	QueryClientProvider,
} from "@raf-query/react";
import { type ReactNode, useState } from "react";

import { queryClientConfig } from "./queries.ts";

/** The docs' `Providers`: one client per server render and per browser tab. */
export function Providers(props: {
	readonly children: ReactNode;
	readonly client?: QueryClient;
}) {
	const [client] = useState(
		() => props.client ?? createQueryClient(queryClientConfig),
	);
	return (
		<QueryClientProvider client={client}>{props.children}</QueryClientProvider>
	);
}
