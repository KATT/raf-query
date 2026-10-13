import {
	type ClientResponse,
	DetailedError,
	hc,
	parseResponse,
} from "hono/client";

import type { Api } from "./app.ts";

export { parseResponse } from "hono/client";
export type { Api } from "./app.ts";

/** A typed client for the API. Responses and inputs are inferred from `app.ts`. */
export function createClient(fetch?: typeof globalThis.fetch) {
	return hc<Api>("/api", { fetch });
}

/** Like `parseResponse`, but resolves `null` for a 404. */
export async function parseFound<T extends ClientResponse<unknown>>(
	response: Promise<T>,
) {
	try {
		return await parseResponse(response);
	} catch (error) {
		if (error instanceof DetailedError && error.statusCode === 404) {
			return null;
		}
		throw error;
	}
}
