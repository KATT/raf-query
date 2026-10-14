import { createApi } from "@examples/api/client";
import { LATENCY_HEADER, parseLatency } from "@examples/db/types";
import { readLatencyCookie } from "#latency-cookie";

export { parseFound, parseResponse } from "@examples/api/client";

/**
 * The API client, sending the settings menu's latency with every request.
 * `#latency-cookie` reads the request's cookie on the server and the
 * document's in the browser.
 */
export const api = createApi(async (): Promise<Record<string, string>> => {
	const latency = parseLatency(await readLatencyCookie());
	return latency === undefined ? {} : { [LATENCY_HEADER]: String(latency) };
});
