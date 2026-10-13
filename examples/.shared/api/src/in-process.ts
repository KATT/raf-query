import { app } from "./app.ts";
import { createClient } from "./client.ts";

export { parseFound, parseResponse } from "./client.ts";

/**
 * Calls the API in this process, without a network round trip. Server
 * rendering uses it: a request to the server's own origin would need the
 * origin, and it waits behind the page on servers that take one request at
 * a time (StackBlitz).
 */
export const api = createClient((input, init) =>
	Promise.resolve(app.request(input, init)),
);
