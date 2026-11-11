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
		parts: [retry(), focusRefetch(), reconnectRefetch(), polling()],
	}),
	(children) => <HydrationBoundary state={state}>{children}</HydrationBoundary>,
);
