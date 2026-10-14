import { LATENCY_COOKIE } from "@examples/db/types";

/** The latency cookie, in the browser. */
export async function readLatencyCookie() {
	return document.cookie
		.split("; ")
		.find((cookie) => cookie.startsWith(`${LATENCY_COOKIE}=`))
		?.slice(LATENCY_COOKIE.length + 1);
}
