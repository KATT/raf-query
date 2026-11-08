"use client";

import {
	type DehydratedState,
	hydrate,
	type QueryClient,
} from "@raf-query/core";
import { hashKey } from "@raf-query/core/internal";
import { type ReactNode, useEffect, useState } from "react";

import { useQueryClient } from "../provider.tsx";

/**
 * Entries the client has no data for, which children need during this
 * render, and entries it already shows, which must wait for a commit.
 */
function split(client: QueryClient, state: DehydratedState) {
	const isShown = (sent: DehydratedState["entries"][number]) =>
		client["~entries"].get(hashKey(sent.queryKey))?.state.hasData === true;
	return {
		deferred: { entries: state.entries.filter(isShown) },
		now: { entries: state.entries.filter((sent) => !isShown(sent)) },
	};
}

/**
 * Writes dehydrated entries into the provided client. Entries the client has
 * no data for are written before its children render, so their reads find
 * the data (or the server's pending request). Newer data for entries already
 * on screen is written after commit, so a render React throws away (an
 * interrupted navigation) doesn't change the current page.
 * Rendered by `HydrationBoundary`; apps don't use it directly.
 */
export function Hydrate(props: {
	readonly children?: ReactNode;
	readonly state: DehydratedState;
}) {
	const client = useQueryClient();
	const state = props.state;
	const [hydrated, setHydrated] = useState<{
		readonly deferred: DehydratedState;
		readonly state: DehydratedState;
	}>();
	if (hydrated?.state !== state) {
		const parts = split(client, state);
		hydrate(client, parts.now);
		setHydrated({ deferred: parts.deferred, state });
	}
	const deferred = hydrated?.deferred;
	useEffect(() => {
		if (deferred && deferred.entries.length > 0) {
			hydrate(client, deferred);
		}
	}, [client, deferred]);
	return props.children;
}
