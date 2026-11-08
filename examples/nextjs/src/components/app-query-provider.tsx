"use client";

import {
	applyStaleTime,
	type QueryTimeDefaults,
	queryTimeDefaults,
} from "@examples/db/types";
import {
	createQueryClient,
	QueryClientProvider,
	recommended,
	useQueryClient,
} from "@raf-query/react";
import { createContext, type ReactNode, use, useState } from "react";

const StaleTimeDefaultsContext = createContext<QueryTimeDefaults | null>(null);

/**
 * The client components' query client: one per server render, which starts
 * no request, and one per browser tab. The client reads its config live,
 * and that config is the object the settings menu mutates, so a new stale
 * time applies to the cache already on screen. Built here, in a client
 * component, because its links and features are functions a server
 * component can't pass.
 */
export function AppQueryProvider(props: {
	readonly children: ReactNode;
	readonly staleTime: number;
}) {
	const [defaults] = useState(() =>
		Object.assign(queryTimeDefaults(props.staleTime), recommended()),
	);
	const [client] = useState(() => createQueryClient(defaults));
	return (
		<StaleTimeDefaultsContext value={defaults}>
			<QueryClientProvider client={client}>
				<BrowserGcTime defaults={defaults} staleTime={props.staleTime} />
				{props.children}
			</QueryClientProvider>
		</StaleTimeDefaultsContext>
	);
}

/**
 * Sets `gcTime` once the browser client exists. A server render leaves it
 * unset. Skipped after the menu has already chosen one.
 */
function BrowserGcTime(props: {
	readonly defaults: QueryTimeDefaults;
	readonly staleTime: number;
}) {
	const client = useQueryClient();
	if (!client.isServer && props.defaults.gcTime === undefined) {
		applyStaleTime(props.defaults, props.staleTime);
	}
	return null;
}

/** The browser client's defaults, the object `AppQueryProvider` built it with. */
export function useStaleTimeDefaults() {
	const defaults = use(StaleTimeDefaultsContext);
	if (!defaults) {
		throw new Error("useStaleTimeDefaults: render it inside AppQueryProvider");
	}
	return defaults;
}
