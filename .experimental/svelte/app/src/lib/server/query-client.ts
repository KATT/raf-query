import {
	DEFAULT_STALE_TIME,
	parseStaleTime,
	queryTimeDefaults,
	STALE_TIME_COOKIE,
} from "@examples/db/types";
import { QueryClient } from "@raf-query/experimental-svelte";
import type { Cookies } from "@sveltejs/kit";

/** A query client for one `load`, with the settings bar's stale time. */
export function createLoadClient(cookies: Cookies) {
	const staleTime =
		parseStaleTime(cookies.get(STALE_TIME_COOKIE)) ?? DEFAULT_STALE_TIME;
	return new QueryClient({ defaults: queryTimeDefaults(staleTime) });
}
