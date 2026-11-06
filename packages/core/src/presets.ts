import { invalidateOnAction } from "./action.ts";
import type { QueryClientConfig } from "./client.ts";
import { focusRefetch, polling, reconnectRefetch } from "./features.ts";
import { retry } from "./links.ts";

/**
 * The behaviors most apps want: retries, refetching on focus and reconnect,
 * polling, and cache busting after actions. Spread it into the config:
 *
 * ```ts
 * createQueryClient({ ...recommended(), staleTime: 30_000 });
 * ```
 */
export function recommended(): Pick<QueryClientConfig, "features" | "links"> {
	return {
		features: [
			focusRefetch(),
			reconnectRefetch(),
			polling(),
			invalidateOnAction(),
		],
		links: [retry()],
	};
}
