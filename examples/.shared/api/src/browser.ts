import { createClient } from "./client.ts";

export { parseFound, parseResponse } from "./client.ts";

/** Calls the API over HTTP, on the page's origin. */
export const api = createClient();
