"use client";

import {
	type DehydratedState,
	hashKey,
	hydrate,
	type HydrateOptions,
	type QueryClient,
} from "@raf-query/core";
import { type ReactNode, useState } from "react";

import { useQueryClient } from "./provider.tsx";

const hydratedByClient = new WeakMap<QueryClient, Set<string>>();

/** Hashes of entries a client received through {@link Hydrate}. */
export function hydratedHashes(client: QueryClient): ReadonlySet<string> {
	return hydratedByClient.get(client) ?? new Set();
}

/**
 * Writes dehydrated entries into the provided client before its children
 * render, so their reads find the data (or the server's pending request).
 * Rendered by `HydrationBoundary`; apps don't use it directly.
 */
export function Hydrate(props: {
	readonly children?: ReactNode;
	readonly options?: HydrateOptions;
	readonly state: DehydratedState;
}) {
	const client = useQueryClient();
	const state = props.state;
	const [hydrated, setHydrated] = useState<DehydratedState | undefined>();
	// Hydrate during render, once per state, so children's reads find the
	// entries. Cache notifications are deferred to a microtask, so other
	// components aren't updated mid-render.
	if (hydrated !== state) {
		let hashes = hydratedByClient.get(client);
		if (!hashes) {
			hashes = new Set();
			hydratedByClient.set(client, hashes);
		}
		for (const query of state.queries) {
			hashes.add(hashKey(query.key));
		}
		hydrate(client, state, props.options);
		setHydrated(state);
	}
	return props.children;
}
