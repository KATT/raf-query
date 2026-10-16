import {
	DEFAULT_LATENCY_MS,
	DEFAULT_STALE_TIME,
	LATENCY_COOKIE,
	parseLatency,
	parseStaleTime,
	STALE_TIME_COOKIE,
} from "@examples/db/types";

import { parsePrefetch, PREFETCH_COOKIE } from "#lib/settings.ts";

import type { LayoutServerLoad } from "./$types";

/** The settings bar's choices, from their cookies. */
export const load: LayoutServerLoad = ({ cookies }) => ({
	latency: parseLatency(cookies.get(LATENCY_COOKIE)) ?? DEFAULT_LATENCY_MS,
	prefetch: parsePrefetch(cookies.get(PREFETCH_COOKIE)),
	staleTime:
		parseStaleTime(cookies.get(STALE_TIME_COOKIE)) ?? DEFAULT_STALE_TIME,
});
