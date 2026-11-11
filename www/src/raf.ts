import { bindQueryOptions } from "@raf-query/react";

import type { makeQueryClient } from "./query-client.ts";

/** `queryOptions` for the site's own queries (pages, demo code), bound to its client. */
export const queryOptions = bindQueryOptions<typeof makeQueryClient>();
