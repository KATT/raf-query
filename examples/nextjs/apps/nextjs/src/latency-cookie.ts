import { LATENCY_COOKIE } from "@examples/db/types";

/** The latency cookie of the request being rendered or handled. */
export async function readLatencyCookie() {
	// Imported when called: client components reach this file through
	// `queries.ts`, and Next.js rejects a static `next/headers` import there.
	const headers = await import("next/headers");
	const store = await headers.cookies();
	return store.get(LATENCY_COOKIE)?.value;
}
