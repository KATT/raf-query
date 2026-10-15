import { createApi } from "@examples/api/client";

import { latencyHeaders } from "./settings.ts";

export { parseFound, parseResponse } from "@examples/api/client";

/** The API client, sending the settings menu's latency with every request. */
export const api = createApi(latencyHeaders);
