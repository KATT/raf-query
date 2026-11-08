import {
	createQueryClient,
	type DehydratedState,
	focusRefetch,
	HydrationBoundary,
	polling,
	reconnectRefetch,
	retry,
} from "@raf-query/react";

import { render } from "./render.tsx";

/** What TanStack Query does without being asked: retries, refetch on focus and reconnect, `refetchInterval`, and hydration. */
declare const state: DehydratedState;

await render(
	createQueryClient({
		features: [focusRefetch(), reconnectRefetch(), polling()],
		links: [retry()],
	}),
	(children) => <HydrationBoundary state={state}>{children}</HydrationBoundary>,
);
